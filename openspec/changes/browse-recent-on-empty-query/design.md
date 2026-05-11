## Context

The `messages` table (`bin/indexer.js:23-33`) stores every indexed user/assistant/tool message with columns `id, conversation_id, project_path, project_name, timestamp, type, content, message_uuid, parent_uuid`. There is no explicit `title` column — Claude Code's own `/resume` UI synthesizes titles from message content at display time, and we'll do the same.

The picker (`bin/picker.js`) currently renders 2-line rows from `ftsSearch` results: line 1 is `${proj}  ${date}  ${msgs} msgs  ${sid}`, line 2 is the FTS snippet (`picker.js:201-219`). When the query is empty, `doSearch` short-circuits to `results = []` (`picker.js:164-170`) and `render` prints the placeholder "Type to search…" (`picker.js:300-301`).

The recent-browse feature replaces the empty-query short-circuit with a real result set. It needs (a) a cheap query for the N most recent conversations, (b) per-conversation title synthesis from the first non-wrapper user message, (c) a tail snippet from the most recent user/assistant message, and (d) seamless transitions when the user starts typing or clears the query.

This design assumes the `interactive-by-default` change has either landed or is landing in parallel; either way the recent-browse trigger is "picker is open and `query.trim() === ""`", which is orthogonal to how the picker was launched.

## Goals / Non-Goals

**Goals:**

- Bare `ccsearch` on a TTY shows a useful, recognizable list of recent conversations without requiring a typed query.
- Title synthesis is good enough that the user can identify the right conversation by reading the row. Bad titles ("Caveat: The messages below…", `<command-name>...`) are filtered.
- The transition between recent and FTS is invisible — no flash, no "loading" placeholder.
- Total recent-browse query cost is under 50 ms on a 30k-message index. Verified at the end of implementation.
- The picker's row geometry stays at 2 lines (header + snippet) — no variable row heights.

**Non-Goals:**

- A one-shot `ccsearch --recent` mode for non-TTY output. Out of scope; called out as a follow-up in the proposal.
- Real titles (Claude Code 1.x storing a `summary` field, etc.). We use the de facto title (first user message) regardless of what future Claude Code versions may add. If a title column appears later, switching to it is a one-query change.
- Multi-project filtering inside recent-browse (e.g., `--project alpha` should narrow recent). The user can apply `--project` and it should work — but we treat that as a free byproduct of the WHERE clause, not a primary feature; not separately specified.
- Persistence of the recent-browse cache across picker invocations. The cache lives only inside a single picker session.

## Decisions

### Decision 1: Recent set built with one CTE-shaped query, not GROUP BY ORDER BY

The naïve query is:

```sql
SELECT conversation_id, MAX(timestamp) AS last_ts, project_path, project_name,
       COUNT(*) AS msg_count
FROM messages
GROUP BY conversation_id
ORDER BY last_ts DESC
LIMIT ?
```

This works and uses `idx_messages_timestamp`. SQLite will scan the index to satisfy `ORDER BY last_ts DESC`, but with `GROUP BY conversation_id` it cannot avoid a full aggregate pass. On a 30k-row index this is sub-millisecond in SQLite, so we don't optimize further. We add `WHERE m.type IN ('user', 'assistant')` to exclude `tool_use`/`tool_result` from the message count and timestamp — matching the "search" semantic users expect (the existing `ftsSearch` does the same exclusion). `--project` filtering, if supplied, is appended as `AND m.project_path LIKE ?` / `m.project_name LIKE ?`, mirroring the FTS path.

**Alternative considered: materialized `conversations` table** updated by the indexer. Faster (O(N) for N conversations on read), but adds schema migration complexity and a second source of truth for `last_ts`/`msg_count` that has to stay in sync with the messages table. The GROUP BY is fast enough that the materialized table earns its complexity only at 10× the current scale. Defer until needed.

### Decision 2: Title synthesis — first non-wrapper user message, capped at 80 chars

For each conversation returned by Decision 1, fetch the first user message:

```sql
SELECT content
FROM messages
WHERE conversation_id = ? AND type = 'user'
ORDER BY timestamp ASC
LIMIT 5
```

We fetch up to 5 candidates so we can skip wrappers. Wrapper detection: a message is a "wrapper" if its trimmed content starts with any of these tags (matching Claude Code's user-message wrapping conventions): `<command-name>`, `<command-message>`, `<command-args>`, `<local-command-stdout>`, `<local-command-stderr>`, `<stdin>`, `<bash-stdout>`, `<bash-stderr>`, `<system-reminder>`. The first candidate whose stripped content has at least 1 non-whitespace character becomes the title source.

The chosen content is then: (a) take only the first line (split on `\n`), (b) strip leading/trailing whitespace, (c) collapse internal whitespace runs to a single space, (d) cap to 80 chars with `…` suffix if longer. If no candidate is usable, the title is `null` and `buildResultLine` falls back to the existing `proj  date  N msgs  sid` line.

**Alternative considered: include assistant first response as title source.** Rejected. The first user message is almost always the question/task — that's the dimension the user remembers. The first assistant response is usually "I'll help you with that…" boilerplate that doesn't aid recognition.

**Alternative considered: regex-skip rather than tag-prefix-match.** Tag-prefix-match is simpler, faster, and covers every wrapper we've seen in real JSONL. We keep the list in one place (`WRAPPER_TAGS` constant) so adding a new tag is a one-line change.

### Decision 3: Tail snippet — most recent message, 1-2 visual lines

```sql
SELECT type, content, timestamp
FROM messages
WHERE conversation_id = ? AND type IN ('user', 'assistant')
ORDER BY timestamp DESC
LIMIT 1
```

We take that single row. We do **not** skip wrappers for the tail (in contrast to titles): the tail is meant to remind the user "where did I leave off" — even if it's a `<command-name>` invocation, that's still useful context. We do strip ANSI escapes and normalize line breaks to spaces; we cap at 240 chars to keep the cache compact (the picker's `truncateToWidth` does the final width-driven truncation at render time).

**Why a separate query rather than fold into Decision 1?** SQL aggregate functions can't easily express "give me the content of the row with MAX(timestamp) per conversation" without window functions, and not every `node:sqlite` build enables them. A second tiny indexed query per conversation is acceptable at N=20.

### Decision 4: New `recentConversations(db, opts)` function lives in `bin/ccsearch`, exposed via `deps`

`bin/ccsearch` already exports a `deps` object to `picker.js` (`bin/ccsearch:820-836`). We add `recentConversations: recentConversations` to it. The function signature:

```js
function recentConversations(db, { limit, projectFilter }) {
  // returns same shape as ftsSearch results, with extra `title` field on each row
  // {
  //   sessionId, projectPath, projectName, lastActivity, msgCount,
  //   snippet,  // tail snippet (plain, no highlight markers)
  //   score: 0,
  //   title,    // string or null
  // }
}
```

Keeping it in `bin/ccsearch` (not in a new file) preserves the project's "two-file-per-process plus indexer" structure. The function is small (~40 lines) and uses helpers already in scope (`projectDisplay`, `shortSession`, the existing DB prep statements).

### Decision 5: Picker mode switching by `query.trim()` only, with one-time cache

In `picker.js`:

- Replace the `if (!query.trim()) { results = []; … }` short-circuit in `doSearch` with:
  ```js
  if (!query.trim()) {
    if (!recentCache) recentCache = deps.recentConversations(db, { limit: args.limit, projectFilter: args.project });
    results = recentCache;
    render();
    return;
  }
  ```
- `recentCache` is a single picker-session-scoped variable, declared alongside the other `let` state at the top of `runPicker` (`picker.js:127-136`). It is **not** invalidated mid-session; if the user wants a refreshed list, they Esc and re-launch ccsearch. This matches the existing assumption that the picker is a snapshot, not a live view.
- `buildResultLine` learns: if `r.title` is non-null, line 1 starts with `r.title + " · " + proj + "  " + date + "  " + msgsStr + " msgs  " + sid` (interpunct between title and metadata to make the boundary scannable). If `r.title` is null, fall back to the existing `proj  date  N msgs  sid` shape. This preserves the FTS row layout for FTS results and tolerates recent rows whose title synthesis failed.
- The empty-state placeholder ("Type to search…") is only shown when `recentCache` would-be is itself empty (index has no conversations) — and in that case it is replaced with the more informative "no conversations indexed yet — run a Claude Code session, then ccsearch" line specified in spec.md.

### Decision 6: Tests use `CCSEARCH_TEST=1` export + fixture DB

We extend the `module.exports` guard introduced in the parallel `interactive-by-default` change to also export `recentConversations`. Test assertions:

1. Order: seed the fixture DB with conversations A (oldest), B (newest); call `recentConversations({limit: 10})`; assert B is row 0, A is row 1.
2. Title source: seed conversation C whose first user message is `<command-name>foo</command-name>` followed by a second user message `"actual user question"`; assert C's title is `"actual user question"` (wrapper skipped).
3. Title cap: seed conversation D with a first user message ≥ 200 chars; assert title length ≤ 81 (80 chars + `…`).
4. Tail: seed conversation E with two messages; assert returned `snippet` matches the second (most recent) message content (whitespace-normalized).
5. Empty index: against a fresh DB with no messages, assert `recentConversations({limit: 10})` returns `[]` (the picker turns this into the friendly "no conversations indexed yet" message).

If the `interactive-by-default` change has not yet landed, this change introduces the `CCSEARCH_TEST` export pattern itself — both changes converge on the same idiom.

## Risks / Trade-offs

- **Risk: title-synthesis produces a misleading title** (e.g., the user starts a Claude session with `"can you check what's in this file"` and resumes it later — the title still says "can you check what's in this file" even though the conversation evolved to be about something else). → Mitigation: this is intrinsic to first-user-message titles and matches `/resume`'s behavior. The tail snippet on line 2 compensates by showing where the conversation is *now*. Together they give enough recognition signal.
- **Risk: an `<command-name>` slash-command session like `/opsx:propose ...` would still produce a usable title only if the wrapper-stripping leaves real content.** → Mitigation: `<command-message>` and `<command-name>` get skipped per Decision 2; the next user message in those flows is usually the human's continuation, which is what we want. Verified against actual JSONL in `~/.claude/projects/` during implementation per `tasks.md` §1.2.
- **Risk: caching the recent list means a long-running picker session won't reflect concurrent Claude Code activity.** → Mitigation: documented behavior. The picker is already a snapshot in time (FTS results aren't live either). If this becomes a real complaint, invalidate `recentCache` on a timer; cheap to add later.
- **Risk: `--project` filtering interaction in recent-browse is under-specified.** → Mitigation: we **do** pass `args.project` through to `recentConversations` and apply it as a `LIKE` filter. Documented in Decision 1. If the user combines `ccsearch --project alpha` with no query, recent-browse is project-scoped — natural and useful. Not separately tested beyond a smoke assertion in `tasks.md`.
- **Trade-off: tail-snippet shows `<command-name>` and other wrappers** when those are the most recent message. Less aesthetic than skipping wrappers, but functionally honest — the user really did invoke that command last. Stripping wrappers from the tail would risk showing stale older content.

## Migration Plan

No migration. The recent-browse view is purely additive to the picker's empty-query state. Rollback is a one-file revert of `bin/picker.js` plus the deletion of `recentConversations` from `bin/ccsearch`. No on-disk or schema state changes.

## Open Questions

- Should the recent-browse footer say `"20 recent"` instead of `"20 results"` to make the mode obvious? Tentatively no — the "results" wording works equally well and avoids special-casing. Revisit if user feedback says the mode is unclear.
- Once a real title field appears in Claude Code's JSONL (likely in a future minor version), should we promote it over the synthesized title? Yes — at that point `recentConversations` reads the title column, and the wrapper-skip heuristic stays only as fallback. Out of scope here; tracked as a one-line code change for whoever ships the indexer schema bump.
