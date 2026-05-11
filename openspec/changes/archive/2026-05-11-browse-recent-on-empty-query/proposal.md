## Why

After the `interactive-by-default` change, `ccsearch` becomes the user's primary way to land back in a past conversation: type `ccsearch`, pick a row, Enter, you're resumed. But today the picker's empty-query state is a dead-end — `picker.js:300` just prints `"Type to search…"`. The user has to remember a keyword from the conversation they want before the tool can help them find it. The natural mental model is the opposite: "show me my recent conversations; I'll recognize the one I want." Claude Code's own `/resume` lists conversations exactly this way (titles + dates), but it only works from inside an already-running Claude session and only searches titles. We make `ccsearch` the better top-level entry point: an `ls`-shaped view of recent conversations, with enough context per row to recognize the right one (a title-like label + a tail snippet), browsable with the existing arrow keys and confirmed with the existing Enter/Ctrl-F bindings.

## What Changes

- When the picker is open and the query is empty (`query.trim() === ""`), populate `results` with the most recent N conversations across all projects, ordered by most-recent-message timestamp DESC. N defaults to `args.limit` (currently default 20) so the existing `--limit` flag carries over without needing a new knob.
- Each row in this "recent browse" view carries two pieces of context the FTS path doesn't currently surface:
  - **Title**: synthesized from the first non-wrapper user message of the conversation (Claude Code stores no explicit title column; the first user message is the de facto title, matching how `/resume` displays things). Truncated to ~60 chars; control characters stripped; wrapper turns like `<command-name>` and stdin-tagged tool hooks skipped over to the next user message.
  - **Tail snippet**: the last 1-2 lines of the most recent user-or-assistant message in the conversation. Plain text, no FTS highlighting, dimmed exactly like the existing search snippet.
- The picker's existing 2-line row layout is reused (`picker.js:201-219`): line 1 leads with the title (followed by `· proj · date · N msgs · short-id` metadata), line 2 is the tail snippet. No new row geometry, no rows-per-result variability.
- Every existing keybinding works unchanged on recent-browse rows: Enter resumes (`cd <project> && claude --resume <id>`), Ctrl-F forks, Ctrl-O prints session id, Ctrl-D prints project path, arrow keys navigate, Esc cancels. The header `"Type to search…"` placeholder is replaced by the actual recent list; if the index is empty (fresh install, zero conversations indexed), a single `"no conversations indexed yet — run a Claude Code session, then ccsearch"` row appears instead.
- The first keystroke into the query box switches back to FTS results, exactly as today. Backspace-to-empty switches back to recent. The transition is silent (no flash) — recent results are cached on the picker's first render and reused on backspace-to-empty.
- The preview pane (right side, when terminal width ≥ 100) continues to work — selecting a recent-browse row renders the same conversation preview it would for any FTS result.
- No change to one-shot (`runOneShot` / `--list`) behavior. The recent-browse view is picker-only. A user who wants a recent-conversations list in shell output continues to use `ccsearch --list` with a query (or runs the indexer status output via `--index-status`); the dedicated one-shot recent-list mode is **not** in scope here and is called out as a follow-up.

## Capabilities

### New Capabilities

- `ccsearch-recent-browse`: Defines the picker's behavior when the query is empty: result-set source (most-recent conversations across all indexed projects), row content (title + metadata + tail snippet), interactions (all existing keybindings apply), and transitions between recent-browse and FTS modes when the user types or clears the query. Also defines title-synthesis rules (first non-wrapper user message) and tail-snippet rules (last user/assistant message, 1-2 visual lines).

### Modified Capabilities

<!-- None. The picker's empty-state behavior is not captured by an existing spec in `openspec/specs/`. -->

## Impact

- **Code**: `plugins/chat-search/bin/ccsearch` — one new query function exported into `deps` for the picker: `recentConversations(db, { limit }) → results[]`. The function returns rows shaped exactly like `ftsSearch` results (`sessionId`, `projectPath`, `projectName`, `lastActivity`, `msgCount`, `snippet`, `score`) plus a new `title` field; the picker's row renderer handles the new field. `plugins/chat-search/bin/picker.js` — `doSearch()` branches on `query.trim()` to call `recentConversations` instead of returning `[]`; `buildResultLine` learns to prefer `r.title` over `r.projectPath` in the line-1 lead when present.
- **Schema**: No schema change. All needed data (`conversation_id`, `timestamp`, `content`, `type`, `project_path`, `project_name`) is already in `messages`. New queries use existing indexes (`idx_messages_conversation`, `idx_messages_timestamp`).
- **Tests**: `plugins/chat-search/bin/ccsearch.test.sh` fixture DB grows two seeded conversations with distinct first-user-message content so title-synthesis can be asserted. One new test block: invoke `recentConversations` via `node -e` (mirroring the `CCSEARCH_TEST` export pattern from `interactive-by-default`) and assert ordering, title selection, and tail-snippet shape.
- **Docs**: `plugins/chat-search/README.md` — the "Picker" / "Modes" section gains a paragraph on the empty-query browse mode. The flag reference is unchanged (no new flags).
- **Users**: A bare `ccsearch` on a TTY now shows the recent-conversations browser. Existing typed-search flow is unaffected.
- **Performance**: Recent-browse adds two cheap queries per picker open: one `GROUP BY conversation_id ORDER BY MAX(timestamp) DESC LIMIT N` and one per-conversation lookup for the title + tail. Both hit existing indexes; on 30k-message indexes the combined cost is well under 50 ms (verified during implementation per `tasks.md` §4.5).
- **Risk**: Low-medium. The dominant risk is bad title selection (e.g., showing a `<command-name>` wrapper) — mitigated by an explicit filter list in design.md §Decision 2 and a regression scenario in spec.md. Secondary risk: if a user's index has a huge skew (one project with 10k conversations), the `GROUP BY` could be slow on poorly-cached SQLite; we accept this since `--limit` already bounds the result count and the underlying indexes are appropriate.

## Dependencies on other in-flight changes

- This change assumes `interactive-by-default` has landed (or lands first) — without it, the picker is opt-in only and the value of this change is muted. Implementation-wise it does **not** require `interactive-by-default`: the new behavior triggers on `query === ""` regardless of how the picker was launched (`-i` or default-on-TTY). Either ordering works.
- This change does **not** depend on `improve-ccsearch-help`. The only doc surface this changes is the README's picker section. If both land, neither blocks the other.
