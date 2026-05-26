# Multivac dashboard redesign: project-grouped picker, smart previews, inline active threads

**Status:** Design · **Date:** 2026-05-24 · **Authors:** Shavkat Aynurin (brainstormed with Claude Code)

## Context

`@krmrn42/multivac` v0.7.0 (per [2026-05-22 architecture refactor](./2026-05-22-multivac-architecture-refactor-design.md)) replaced a 1,080-LOC hand-rolled ANSI picker with an Ink + React TUI and introduced the `ChatSource` interface as the per-tool seam. The on-screen experience, however, is unchanged in shape: a single result list with a side preview pane, populated either by the user's typed FTS query or by a recent-conversations fallback.

This spec redesigns that experience into a **thread-management dashboard**. The premise: multivac is not really a search tool the user invokes once; it's the surface the engineer keeps reaching for during the day to see what they're working on, what they were just working on, and to start or resume in one keystroke. The current UI serves only the "find a past chat by keyword" journey well. Several other journeys — *what is currently running and where*, *what working dirs do I keep coming back to*, *what does this chat actually contain* — are absent or weakly served.

### What v0.7 already gets right (preserved)

- Sub-second startup; incremental indexer (~30ms typical refresh).
- FTS5 BM25 ranking over message bodies across all projects.
- `Enter` resumes in the conversation's original project dir; `Ctrl-F` forks; `Ctrl-T` remote-control; `Ctrl-W` tmux window; `Ctrl-R` rename; `Ctrl-P` pin; `Ctrl-O` print session id; `Ctrl-D` print project path.
- Two-layer opt-in for `--dangerously-skip-permissions` (Alt-Enter / Shift-Enter).
- `ChatSource` interface — discovery / parse / resume / install separated cleanly; multi-source-ready.
- Schema v2 with `source` column; sessions config keyed by `source:id`.
- Pre-commit hook enforces `dist/` ≡ `src/`; 128 shell tests + 43 unit tests cover the picker, search, indexer, and resume paths.

### What's missing (the dashboard mandate)

1. **No awareness of currently-running AI CLI processes.** Multivac sees only JSONL files on disk; it does not know whether any of them have a `claude` process attached *right now*.
2. **No first-class "working directory" concept.** `--project` filters by substring, but a dir is never a result row; the user can't see "I have 12 chats in `~/work/frontend`" as a unified entity nor open a fresh chat there with one keystroke.
3. **Preview content is bare turn-by-turn.** Claude Code emits `type=system, subtype=away_summary` messages (one-paragraph recaps like "You asked X, I did Y, next: Z"); v0.7's parser ignores `system` rows entirely. Similarly `gitBranch`, `attributionSkill`, and `permissionMode` are present per message in JSONL and discarded.
4. **No layout for the "what am I doing now" glance.** A header strip with the live threads is the layout primitive that's missing.

### Goals

1. **Project-grouped picker.** The primary surface is a single list of **projects** (working directories that contain at least one chat), each project followed by its most-recent chats inline. The previous "two-section" picker (working dirs ↑ chats ↓) is replaced.
2. **Active threads in-context (v0.8.2).** Running `claude` processes appear inside their project's group — mapped to a specific chat row when possible, listed above the project's chats when not. There is no separate header strip.
3. **Smart row previews.** When `away_summary` exists for a chat, surface it. Otherwise show the head of the most recent assistant message. Add a metadata strip per row (branch, active skill, permission mode).
4. **Visual refresh.** Rounded borders, focus-aware accent colors, NO_COLOR conformance, predictable degradation down to 60-col terminals.
5. **Preserve every v0.7 keybinding.** New keys only (`N`, `r` in v0.8.2) — no rebindings. Existing scripts and slash commands keep working.

### Non-goals

- **Multi-source detection** (Aider, Codex CLI, Gemini CLI) is deferred to phase 2 (post-v0.8.2). The `ActiveThreadSource` interface accommodates it; the v0.8.x implementation hard-codes Claude.
- **Subagent JSONLs as their own "projects".** Subagent transcripts live at `~/.claude/projects/<encoded-cwd>/<conv-id>/subagents/agent-*.jsonl`. Each subagent message carries the `cwd` the subagent happened to run in (often a subdirectory like `packages/multivac`). Indexing those `cwd` values verbatim creates phantom "projects" that are really just subdirectories the controller walked into. **v0.8.1 coerces every row from a subagent JSONL to the parent session's project_path at parse time** (see §D15). The subagent content remains FTS-searchable; it just doesn't manufacture new project groups.
- **Daemon / always-open dashboard mode.** The v0.8.x series closes on action like today; if the user wants a persistent dashboard, that's a separate piece of work.
- **Filesystem watchers.** Recursive `fs.watch` on `~/.claude/projects/` is platform-fragile (Linux `inotify` limits, macOS FSEvents semantics). Polling-only.
- **IDE-embedded chat sources** (Cursor, Copilot Chat). Same exclusion as the v0.6 → v0.7 refactor spec.
- **Mouse support, alternate-screen toggling, or kitty-graphics-based renderings.** Keyboard-first, alt-screen-on (today's behavior), pure text glyphs.
- **Renaming the package, binary, marketplace plugin, or any user-visible paths.** Backward compatibility is hard.

## Architecture

```mermaid
graph TB
  TUI["TUI (Ink + React)<br/>App.tsx + components/*"]
  Producer["buildProjectGroups()<br/>emits ProjectHeader + 0..N ChatRow + optional MoreRow per project"]
  ChatSource["ChatSource (Claude)<br/>v0.7 parser + subagent project_path coercion (v0.8.1, §D15)"]
  ProjectsSource["ProjectsSource<br/>SQL-derived from the shared index — no external state"]
  ActiveSource["ActiveThreadSource (Claude) — v0.8.2<br/>process scan + tmux; results placed INSIDE the matching project group"]
  Index["SQLite FTS5 index — schema v4<br/>columns: subtype, git_branch, attribution_skill (v3) + subagent-aware project_path (v4)"]
  OS["OS<br/>pgrep · /proc/PID/cwd · lsof · tmux list-panes"]

  TUI --> Producer
  Producer --> ProjectsSource
  Producer --> ChatSource
  Producer -. v0.8.2 .-> ActiveSource
  ChatSource --> Index
  ProjectsSource --> Index
  ActiveSource -. live scan .-> OS
  ActiveSource -. correlate session id .-> Index
```

`buildProjectGroups()` is the single producer that the TUI hook (`useSearch`) and the one-shot `--list` path both call. It interleaves project headers and their chat rows in one flat `Selectable[]`. `ProjectsSource` is a pure SQL aggregator over the existing `messages` table — no separate state. `ActiveThreadSource` (v0.8.2) injects its rows INSIDE each project's group; there is no separate header strip.

## Decisions

### D1 — Project-grouped picker + preview pane

The new full-width (`cols ≥ 100`) screen anatomy. Projects are the top-level entries; each project's recent chats are listed underneath, with an optional dim "Y more" footer when chats are elided.

```
multivac >  frontend                                              [3 projects · 18 chats]
╭─ Projects (focused) ──────────────────────┬─ Preview ───────────────────────────╮
│ 📁 ~/work/frontend         12 chats  3h   │ ╭─ react-router-fix ────────────────╮│
│   ▌💬 react-router-fix     47 msgs        │ │ (main) · superpowers:tdd          ││
│     recap: refactored Router to add an    │ │ 2026-05-20 → 2026-05-23 · 47 msgs ││
│     error boundary; merged via PR #142    │ ╰───────────────────────────────────╯│
│    💬 oauth-debug          12 msgs        │                                       │
│     ask: frontend OAuth flow…             │ ▶ user 12:14                          │
│    💬 deploy-staging        8 msgs        │   investigate the navigation crash on │
│     ans: blue/green via gh actions        │   /settings                           │
│      9 more                               │ ◀ assistant 12:14                     │
│                                           │   I see three options. (1) add an     │
│ 📁 ~/work/backend           4 chats  2d   │   error boundary at the Route…        │
│    💬 auth-refresh         18 msgs        │                                       │
│     ask: refresh token rotation           │                                       │
│      3 more                               │                                       │
│                                           │                                       │
│ 📁 ~/krmrn-skills          24 chats  10m  │                                       │
│   …                                       │                                       │
╰───────────────────────────────────────────┴───────────────────────────────────────╯
 Enter resume   N new-chat   Ctrl-F fork   Ctrl-T remote   Ctrl-R rename   ?
```

**v0.8.2 layout** (active threads inline, no separate header strip):

```
│ 📁 ~/work/frontend         12 chats  3h   │
│   🟢 react-router-fix      tmux:3  live   │  ← mapped active thread; replaces the chat row's normal icon
│     recap: refactored Router…             │
│   🟢 (no chat yet)         pid 41523       │  ← unmapped active thread (no chat created yet)
│   💬 oauth-debug          12 msgs         │
│   …                                       │
```

**Rationale:** The user reaches for multivac to navigate among **the projects they're working in** and the **chats inside each**. The old two-section layout (working dirs ↑ chats ↓) repeated the same information twice — a chat row already tells you what dir it's in. Grouping by project answers the dashboard's primary question ("what am I working on?") with one glance and lets each project be browsed in place.

**Alternative considered:** A flat by-relevance list (today's chat-only view) augmented with a `[+ start a new chat in ~/work/frontend]` row at the top of each project's group of chats. Rejected because that flattens the visual hierarchy — the project becomes a tiny annotation rather than the structural element you scan first.

### D2 — Schema v3 migration

Schema bumps from v2 to v3 to accommodate three new per-message columns. The migration drops + recreates the FTS5 virtual table and re-indexes from scratch (consistent with v0.6 → v0.7 precedent).

```sql
-- detected on first run by absence of `subtype` column in PRAGMA table_info(messages)
ALTER TABLE messages ADD COLUMN subtype           TEXT NULL;
ALTER TABLE messages ADD COLUMN git_branch        TEXT NULL;
ALTER TABLE messages ADD COLUMN attribution_skill TEXT NULL;
DROP TABLE messages_fts;
CREATE VIRTUAL TABLE messages_fts USING fts5(
  id UNINDEXED,
  content,
  content='messages',
  content_rowid='rowid'
);
INSERT INTO messages_fts(rowid, id, content) SELECT rowid, id, content FROM messages;
```

The columns are NULL on existing rows after migration; the parser re-populates them on the subsequent indexer pass (which the v0.6→v0.7 precedent already established as user-tolerable).

**Rationale:** Three small columns vs. one JSON blob. Splitting them keeps the schema queryable (`WHERE git_branch = 'main'`) and lets future filters land without further schema work. NULL semantics communicate "not extracted" without ambiguity.

**Alternative considered:** Stuffing all metadata into a single `meta TEXT` JSON column. Rejected because every downstream consumer would need `json_extract()`; the column count is small enough that explicit beats implicit.

### D3 — Parser extensions

`INDEXABLE_TYPES` in `src/sources/claude/parse.ts` extends from `{user, assistant, tool_use, tool_result}` to additionally include `system` **only when** `subtype === "away_summary"`. Other `system` subtypes (`hook_success`, `mcp_instructions_delta`, `skill_listing`, `command_permissions`, etc.) remain silently skipped — they are operational noise the user does not want in FTS results.

Per-message extraction at parse time:

| JSONL key | Destination | Notes |
|---|---|---|
| `subtype` | `messages.subtype` | NULL for user / assistant / tool rows; `"away_summary"` for the system rows we now index |
| `gitBranch` | `messages.git_branch` | NULL when absent (legacy rows) |
| `attributionSkill` | `messages.attribution_skill` | NULL when no skill was active |

The away_summary content lives in the JSONL top-level `content` field (a string), unlike `user` / `assistant` which nest it under `message.content`. Parser handles both shapes.

**Rationale:** Per-message metadata enables the smart preview (D6) and the row metadata strip (D4) without touching the storage layer. Index-time extraction is cheaper than render-time JSON re-parsing and keeps the SQL queries dumb.

### D4 — Row types with a shared Selectable interface

The picker ingests four row kinds, distinguished by `kind: "project" | "chat" | "more" | "active"`. Selectable behavior:

| Kind | Cursor lands on it? | `Enter` does | Preview pane |
|---|---|---|---|
| `"project"` | yes | `newchat` in that dir | project-header preview (D7) |
| `"chat"` | yes | `resume` that chat | chat preview (D7) |
| `"more"` | **no** — cursor skips it on ↑/↓ | n/a (informational) | empty (preview is from neighbour) |
| `"active"` (v0.8.2) | yes | switch to tmux window (when present) or print PID+cwd | active-thread preview |

```typescript
type Selectable = ProjectHeader | ChatRow | MoreRow | ActiveThreadRow;

interface ProjectHeader {
  kind: "project";
  projectPath: string;
  projectName: string;
  chatCount: number;          // TOTAL chats in this project (not just shown)
  lastActivity: number;
  topChatTitles: string[];    // up to 3, for header secondary line when chats below are NOT shown
}

interface ChatRow extends ResultRow {
  kind: "chat";
  gitBranch?: string;
  skill?: string;
  permissionMode?: string;
  recapText?: string;         // away_summary | head-of-last-assistant
}

interface MoreRow {
  kind: "more";
  projectPath: string;        // the project this footer belongs to
  remainingCount: number;     // chatCount − shown chats in this project's group
}

interface ActiveThreadRow {   // v0.8.2 only
  kind: "active";
  source: SourceId;
  pid: number;
  cwd: string;
  sessionId: string | null;   // null when JSONL not yet identifiable
  chatRowId?: string;         // when mapped to an existing chat, the conversation_id; otherwise undefined
  tmuxPaneId?: string;
  tmuxWindow?: { index: number; name: string };
  lastActivityMs: number;
  status: "live" | "idle";    // mtime-based
}
```

**Visual specs per row** (preview pane has its own per-kind layout, see D7):

```
Project header (2 lines):
 📁 ~/work/frontend                       12 chats   3h ago
    main · feat/router-fix · superpowers:tdd

Chat row (3 lines, unchanged from v0.8):
 💬 react-router-fix       3h ago   47 msgs   abc-123
    (main) · superpowers:tdd · permission=dangerous
    recap: refactored Router to add error boundary; merged via PR #142

More row (1 line, dim):
      9 more

Active thread row (v0.8.2, inline replacement for the chat row OR injected above chats):
 🟢 react-router-fix        tmux:3  live  47 msgs
    (main) · 12s ago
```

When matched by an FTS query, the chat row's third line is replaced with the BM25 snippet (today's `<<<>>>` highlighted span) rather than the recap.

**Rationale:** Four kinds — but `more` rows are non-interactive structure (the cursor flies over them) and `active` rows are v0.8.2. The day-one v0.8.1 surface is effectively two interactive kinds (`project` and `chat`) plus one cosmetic kind (`more`).

### D5 — ActiveThreadSource: process discovery + tmux correlation + project-group placement (v0.8.2)

The hardest unknown in this design. The implementation lives at `src/sources/claude/active.ts` (sibling to `discover.ts` and `parse.ts`).

**Placement in the result list (v0.8.2):**

Active threads are NOT a separate top strip. They are emitted INSIDE each project's group by `buildProjectGroups()`:

```
For each project (already ordered by last activity desc):
  emit ProjectHeader
  if this project has active threads:
    for each active thread:
      if thread is mapped to a chat in this project (chatRowId set):
        — replace that chat's row with an active-thread row carrying its data, OR
        — keep the chat row and add a 🟢 marker decoration. Implementation choice
          deferred to writing-plans; both honor §D4.
      else (unmapped thread — `claude` is running but no JSONL discovered yet):
        emit ActiveThreadRow at the TOP of this project's chat list (above all chats)
  emit chat rows (up to X per the §D9 sizing rules)
  emit MoreRow when chats are elided
```

A `claude` process whose `cwd` doesn't match ANY indexed project's path gets its own synthetic ProjectHeader at the top of the list (project may be new — no chats yet — and that's fine; the header has `chatCount: 0`).

**Linux discovery:**

```typescript
// 1. Find candidate PIDs
const pids = await spawnCapture("pgrep", ["-f", "^claude($| )"]);

// 2. For each, read cwd from /proc
for (const pid of pids) {
  const cwd = await readlink(`/proc/${pid}/cwd`);

// 3. Map cwd → projects-dir encoding → newest JSONL by mtime
  const encoded = cwd.replace(/\//g, "-");  // matches Claude Code's own encoding
  const dir = path.join(projectsRoot(), encoded);
  const jsonls = await listJsonlsByMtime(dir);
  const live = jsonls[0];  // newest

// 4. Classify by mtime age
  const age = Date.now() - live.mtimeMs;
  const status: "live" | "idle" =
    age < 60_000 ? "live" :
    age < 30 * 60_000 ? "idle" :
    null;  // drop the row
}
```

**macOS discovery:** identical flow but uses `lsof -p ${pid} -d cwd -F n` and parses the last `n`-prefixed line. The fork is contained in `readProcessCwd(pid)`; the rest of the pipeline is shared.

**Tmux augmentation** (only when `$TMUX` env var is set):

```bash
tmux list-panes -a -F '#{pane_id}\t#{pane_pid}\t#{pane_current_command}\t#{window_id}\t#{window_index}\t#{window_name}'
```

Cross-reference the `pane_pid` set with the active-thread PID set. For matches, attach `tmuxPaneId` + `tmuxWindow` to the row. The match is on **pane PID**, not the claude PID directly — tmux reports the leader process of the pane (usually the shell), and `claude` is a descendant. So we walk each active-thread PID's parent chain (via `/proc/${pid}/stat` field 4 on Linux, or `ps -o ppid=` on macOS) up to 5 levels and match the first ancestor that appears in the `pane_pid` set. Five levels comfortably covers the realistic chain `shell → claude → child_process`; deeper chains imply the user is doing something exotic (nested tmux, screen-inside-tmux) and graceful no-match is acceptable.

**Refresh strategy:**

- Scan once synchronously on picker open (~5ms for 20 PIDs).
- Background interval every 4s via `setInterval`; recompute the full `ActiveThreadRow[]` and re-render if the array changed (deep-equal on the sorted-by-PID rows: PID set, status, lastActivityMs bucket, tmux assignment). A status change from `live` to `idle` therefore triggers a re-render even without a PID change.
- `r` keypress force-refreshes outside the interval.
- No filesystem watcher in v1.

**Display when empty:** Nothing is shown. With no separate header strip, the absence of active threads is the absence of 🟢 markers in the project list — no layout shift, no empty box.

**Rationale:** mtime is the load-bearing assumption. It works because Claude Code writes to the JSONL on every turn, so the gap between writes rarely exceeds 30 seconds when the human is actively engaged. It fails on long-running tool calls (a 5-minute pytest run will mark a session "idle" mid-conversation). The `idle` status with the yellow indicator is the honest representation of that uncertainty — we don't pretend to know which side of "is this currently being typed in" we're on.

**Alternative considered:** Using inotify / FSEvents for filesystem watch. Rejected: cross-platform fragility (Linux watch limits, macOS FSEvents quirks), marginal accuracy gain (4-second polling is already plenty for human-paced work), and a watcher would add complexity to the lifecycle (start / stop / re-init on picker close-and-reopen).

### D6 — Smart preview content: away_summary first, last-assistant head fallback

When rendering a chat row's preview text (the third line in the result list AND the preview pane header), the data layer queries in priority order:

```sql
-- Step 1: most recent away_summary, if it comes AFTER the last user message
WITH last_user AS (
  SELECT MAX(timestamp) AS ts
  FROM messages
  WHERE conversation_id = ? AND source = ? AND type = 'user'
)
SELECT content FROM messages, last_user
WHERE conversation_id = ? AND source = ?
  AND type = 'system' AND subtype = 'away_summary'
  AND timestamp > last_user.ts
ORDER BY timestamp DESC LIMIT 1;
```

If no row, fall back:

```sql
-- Step 2: head of the most recent assistant message
SELECT content FROM messages
WHERE conversation_id = ? AND source = ? AND type = 'assistant'
ORDER BY timestamp DESC LIMIT 1;
```

Take the first 5 visible lines (after wrapper-stripping and collapsing whitespace).

**Why "after the last user message"?** Claude emits `away_summary` periodically during a session (when the user has been away). If the user then asks a follow-up question, the recap is stale until Claude emits a new one. The freshness filter ensures we never show a recap that pre-dates the most recent user input.

**Rationale:** The user explicitly directed this rule. away_summary content is purpose-built recap text; everything else is heuristic. The fallback is "head of last assistant message" rather than "tail of last message" (today's behavior) because the *start* of Claude's reply is its thesis, while the tail is often the closing pleasantry or final code block.

**Alternative considered:** Synthesizing recaps via an embedding model or LLM call. Rejected: violates the zero-runtime-dependencies ethos and adds privacy surface (a multivac invocation should not send chat content anywhere).

### D7 — Preview pane content per row kind

| Row kind | Preview pane layout |
|---|---|
| Chat | Header box (title · branch · skill · date range · msg count) + first 20 message-turn render (today's `renderPreview` from `src/core/render/preview.ts`) |
| Project | Header box (path · chat count · branches touched) + top-5 recent chats list with their recap snippets + hint "Enter: new chat here" |
| More | Empty (preview content stays from the chat row above) |
| Active (v0.8.2) | Header box (status · cwd · pid/tmux · last write) + last 6 user/assistant turns of the live session (re-queried each refresh interval) + hint "Enter: switch to tmux:N" or "Enter: print PID+cwd" |

Mockups:

```
─ Chat row preview ───────────────────────────
╭─ react-router-fix ────────────────────────╮
│ (main) · superpowers:tdd                  │
│ 2026-05-20 → 2026-05-23 · 47 msgs         │
╰───────────────────────────────────────────╯

▶ user 12:14
  investigate the navigation crash on /settings
◀ assistant 12:14
  I see three options. (1) add an error boundary…
…
```

```
─ Project header preview ─────────────────────
╭─ ~/work/frontend ─────────────────────────╮
│ 12 chats · last 3h ago                    │
│ branches: main, feat/router-fix           │
╰───────────────────────────────────────────╯

Recent chats here:
  💬 react-router-fix    3h ago  47 msgs
     recap: refactored Router to add error boundary
  💬 oauth-debug         1d ago  12 msgs
     ask: frontend OAuth flow
  💬 deploy-staging      3d ago   8 msgs

(Enter: new chat here)
```

```
─ Active thread preview ──────────────────────
╭─ 🟢 react-router-fix ─────────────────────╮
│ ~/work/frontend (main)                    │
│ tmux: window 3 · PID 41523                │
│ live · last write 12s ago                 │
╰───────────────────────────────────────────╯

Recent turns:
▶ user 12:14   investigate the navigation crash…
◀ assistant 12:14   I see three options…
▶ user 12:18   yes go with option 2
◀ assistant 12:18 (typing…)

(Enter: switch to tmux:3)
```

**Rationale:** Each preview answers the question the user is asking when they highlight that row kind. For a chat: "what was this about?" For a dir: "what's been happening here?" For an active thread: "what's going on right now?"

### D8 — ProjectsSource: SQL-derived, no external state

`ProjectsSource` (file: `src/core/search/projects.ts`; export: `searchProjects(db, opts)`) implements no `discover` / `parse` — it's purely a query against the existing `messages` table:

```sql
SELECT
  project_path,
  MAX(project_name) AS project_name,
  COUNT(DISTINCT conversation_id) AS chat_count,
  MAX(timestamp) AS last_activity
FROM messages
WHERE type IN ('user', 'assistant')
GROUP BY project_path
ORDER BY last_activity DESC;
```

Search-time filter:

```sql
... WHERE LOWER(project_path) LIKE '%' || ? || '%'
     OR  LOWER(project_name) LIKE '%' || ? || '%'
```

Top chat titles per dir (used for the row's second line):

```sql
SELECT conversation_id, MAX(timestamp) AS ts
FROM messages
WHERE project_path = ? AND type IN ('user', 'assistant')
GROUP BY conversation_id
ORDER BY ts DESC LIMIT 3;
-- then per-conversation: existing synthesizeTitle / saved-name lookup
```

**Rationale:** Zero new external state. Existing index already has everything needed. The query is O(distinct project_path) which on a typical machine is dozens of paths, not thousands.

**Alternative considered:** A separate `projects` table denormalized at indexer time. Rejected: redundant data, drift risk during partial indexer failures, no performance need.

### D9 — Project-grouped picker semantics

`buildProjectGroups(db, args, sessionStore)` is the single producer for both the picker (`useSearch`) and the one-shot `--list` path. It returns a flat `Selectable[]` shaped as:

```
[ProjectHeader, ChatRow, ChatRow, …, MoreRow?,    ← project 1
 ProjectHeader, ChatRow, …,         MoreRow?,    ← project 2
 …]
```

Projects are ordered by **most recent activity desc** (`MAX(timestamp) per project_path`). Within a project, chats are ordered by their own `MAX(timestamp) desc`.

**Per-project chat-count sizing (X chats shown out of `chatCount` total):**

| Mode | Determination of X (chats shown) |
|---|---|
| **Home (no query)** | `X = min(3, chatCount)` for every project |
| **Search, query hits project name/path** | `X = max(3, chatsMatchingQuery)` — the project's matching chats are shown in full, padded to a minimum of 3 if there are fewer matches than that |
| **Search, query does NOT hit project name/path** | `X = chatsMatchingQuery` (could be 0) |
| **Hide project entirely** | when `X == 0` after the rules above |

`MoreRow.remainingCount = chatCount - X`; emitted only when `remainingCount > 0`.

The cursor lands on the **first selectable row** of the result (typically the first project header). `more` rows are skipped on ↑/↓ navigation (reducer §D4 table).

**Empty result** — when no projects match, the producer emits an empty `Selectable[]`; the picker shows `(no results)` (today's behavior).

**Rationale:** Grouping by project makes the picker's primary axis (project) visible as structure. The X sizing rules ensure that:
- In home mode, every project is digestible (3 chats max) and the "Y more" hint advertises further depth.
- In search mode, the user sees ALL their matches when scoped within a project, but matches in a non-matching project are still surfaced — this preserves the v0.8 FTS-as-discovery behavior.
- A project with no shown chats has no useful information in this list, so it's omitted; the user would only see it via a deeper search that does match its chats.

**Alternative considered:** Fixed X = 3 in all modes, with search restricted to the 3 shown chats per project. Rejected: it silently hides matches.

### D10 — Keybindings: preserve v0.7, add two (v0.8.1) + one (v0.8.2)

The full v0.7 keybinding set is preserved verbatim. New keys:

| Key | Action | Available on | Introduced in |
|---|---|---|---|
| `N` | new chat in the row's project dir (chat: chat's project dir; project: that project; active: active's cwd) | all selectable rows | v0.8.1 |
| `r` | force-refresh active threads | always | v0.8.2 |

(No `Tab`/`Shift-Tab` — there is no separate header strip in the project-grouped layout, so there's nothing to cycle focus between.)

The status bar continues to show only bindings valid for the **currently-selected** row (today's logic, extended). Action availability matrix:

| Key | Chat row | Project row | More row | Active thread row (v0.8.2) |
|---|---|---|---|---|
| `Enter` | resume | new chat here | — (cursor never lands on it) | switch to tmux:N (else print PID+cwd) |
| `Alt/Shift-Enter` | dangerous resume (armed) | — | — | — |
| `N` | new chat in chat's project dir | new chat here | — | new chat in active's cwd |
| `Ctrl-F` | fork | — | — | — |
| `Ctrl-T` | remote-control | — | — | — |
| `Ctrl-W` | tmux new-window | — | — | — |
| `Ctrl-R` | rename | — | — | — |
| `Ctrl-P` | pin | — | — | — |
| `Ctrl-O` | print session id | — | — | print session id |
| `Ctrl-D` | print project path | print path | — | print cwd |
| `r` (v0.8.2) | always | always | always | always |

`Ctrl-W` on project rows is deferred to v0.8.2 (requires extending `buildTmuxNewWindowCommand` to spawn `claude` without `--resume`).

**Rationale:** Preservation is contract — users have muscle memory and scripts depending on these keys. The two-key v0.8.1 addition (`N`) is the minimum needed to expose the project-row new-chat action.

**Alternative considered:** Repurposing rarely-used keys (e.g., reassigning `Ctrl-O` to "open new chat"). Rejected because muscle memory is a one-way ratchet — breaking it once costs trust permanently.

### D11 — Visual treatment: rounded borders, focus-aware accent, NO_COLOR conformance

**Borders:** rounded box-drawing throughout (`╭─╮ │ ╰─╯`). Replaces today's straight `┌─┐ │ └─┘`. Focused panels: bright accent border. Unfocused: dim border. Header strip border: bright when active threads exist, dim when empty.

**Color palette:**

| Role | Color | Existing? |
|---|---|---|
| Accent (prompt, focused borders, section labels) | cyan | existing (v0.7) |
| Success / live | green | existing |
| Warning / idle | yellow | existing (extended) |
| Danger / dangerous-perm armed | red | existing |
| Pin marker | yellow `📌` | existing |
| Dim metadata | default-fg + dim attr | existing |

**Glyph fallbacks for `--no-color` / `NO_COLOR` env:**

| Glyph | Fallback |
|---|---|
| 📁 project | `[proj]` |
| 💬 chat | `[chat]` |
| 🟢 live (v0.8.2) | `*` |
| 🟡 idle (v0.8.2) | `.` |
| 📌 pin | `*` |
| ╭─╮ rounded box | `+--+` straight ASCII |

**`TERM=dumb`** disables all box-drawing entirely; falls back to indent + dividers only.

**Rationale:** Rounded borders are softer and the modern TUI convention (charm, gum, lipgloss-styled apps default to them). Focus-aware borders mean the user always knows which panel will receive a keypress without needing to think about it. NO_COLOR conformance is non-negotiable for accessibility and pipeline compatibility.

### D12 — Responsive degradation

Four breakpoints:

| Width | Layout |
|---|---|
| `cols ≥ 100` | Project-grouped results list + preview pane (40% / 60% split) |
| `cols < 100` | Project-grouped results full width; preview pane hidden |

Body row count = `dims.rows - reservedRows`, where `reservedRows` accounts for prompt (1) + status bar (1-2) + rename modal hint (1 when in rename mode).

**Rationale:** Two breakpoints — the spec now has only two top-level visual zones (results + optional preview), so the previous four-step degradation of "header strip → one-line header strip → no strip" collapses into a single show/hide of the preview pane.

### D13 — `multivac --list` becomes markdown

The `--list` flag (which historically forced one-shot text output) now produces **markdown-formatted** results — sectioned, with embedded resume one-liners as inline code. This is opt-in: the slash command (`/chat-search:find`) and TSV consumers are unaffected because they specify `--format=text` or `--format=tsv` explicitly.

Example output for `multivac --list "frontend"` (one heading per project; chats listed under each):

```markdown
## ~/work/frontend — 12 chats matching "frontend", last activity 3h ago

New chat here: `(cd ~/work/frontend && claude)`

1. **react-router-fix** — 3h ago · 47 msgs (main)
   - recap: refactored Router to add error boundary; merged via PR #142
   - Resume: `(cd ~/work/frontend && claude --resume <session-id>)`

2. **oauth-debug** — 1d ago · 12 msgs
   - ask: frontend OAuth flow…
   - Resume: `(cd ~/work/frontend && claude --resume <session-id>)`

(9 more)

## ~/krmrn-skills — 1 chat matching "frontend", last activity 5d ago

New chat here: `(cd ~/krmrn-skills && claude)`

1. **plugin-frontend-prototype** — 5d ago · 4 msgs
   - Resume: `(cd ~/krmrn-skills && claude --resume <session-id>)`
```

For the home view (`multivac --list` with no query), the heading omits `matching "..."` (uses "recent activity" wording) and the X-per-project rule is min(3, chatCount):

```markdown
## ~/work/frontend — 12 chats, last activity 3h ago

New chat here: `(cd ~/work/frontend && claude)`

1. **react-router-fix** — 3h ago · 47 msgs (main)
   - recap: refactored Router…
   - Resume: `(cd ~/work/frontend && claude --resume <session-id>)`

2. **oauth-debug** — 1d ago · 12 msgs
   - Resume: `(cd ~/work/frontend && claude --resume <session-id>)`

3. **deploy-staging** — 3d ago · 8 msgs
   - Resume: `(cd ~/work/frontend && claude --resume <session-id>)`

(9 more)
```

**Rationale:** Markdown is the natural format for human-readable lists that may be pasted into a document, an issue, or a Claude Code session. Embedded inline code for resume commands preserves the v0.7 copy-pasteability. Section structure mirrors the dashboard's section dividers — the on-screen and printed views are isomorphic.

**Alternative considered:** Keep `--list` as today's text format; add `--format=markdown` as a new value. Rejected because today's `--list` text format and `--format=text` already produce identical output — there's no behavioral distinction. Repurposing `--list` for markdown is the cleanest possible split.

### D14 — Phasing: v0.8 / v0.8.1 / v0.8.2

Three independently mergeable releases. Each ships value on its own and is reviewable in isolation. The series uses patch-version bumps (rather than minor bumps to v0.9 / v1.0) because all three releases serve the same dashboard-redesign goal and the public CLI surface stays additive — no breaking changes to flags, output shapes, or DB consumers between them.

| Release | Scope | Risk |
|---|---|---|
| **v0.8 — Indexer + theme refresh** ✅ shipped | Schema v3 migration · away_summary indexing · gitBranch / attributionSkill columns · rounded borders · focus-aware accent · new chat-row preview (recap + metadata strip) | Low — pure rendering + parser additions; existing layout unchanged |
| **v0.8.1 — Project-grouped picker** | ProjectHeader + MoreRow types · `searchProjects` + `buildProjectGroups` · single project-grouped list · `N` new-chat key on project + chat rows · project-header preview pane · `--list` becomes project-grouped markdown · subagent JSONL `project_path` coercion (§D15) · schema bump v3 → v4 (drop-rebuild) | Medium — touches the results model, reducer, indexer parser, and one-shot path |
| **v0.8.2 — Active threads inline** | ActiveThreadSource (Claude only) · active-thread rows injected into project groups (mapped to chat rows when possible, otherwise above the chat list) · `r` refresh · tmux pane correlation · `Ctrl-W` on project rows | Higher — process discovery has per-OS forks; tmux integration depends on `$TMUX` |

**Phase 2 (post-v0.8.2):** Aider source · Codex CLI source · Gemini CLI source · richer subagent integration (today they're indexed for FTS but `project_path`-coerced — Phase 2 could expose them as their own row kind under the parent chat) · pin folders/groups · daemon mode for persistent dashboard.

**Rationale:** Each release maps to a self-contained engineering chunk and a testable surface. Risk increases monotonically. The phasing means a regression in v0.8.2 doesn't block the value of v0.8 and v0.8.1 from already being in users' hands.

### D15 — `project_path` locking + non-user-session filtering (v0.8.1)

**Two problems that v0.8 manifested as "phantom projects":**

1. **Per-message `cwd` drift in top-level JSONLs.** When the controller in an interactive Claude session invokes a tool that changes directory (e.g., `cd packages/multivac && npm test`) or spawns a nested subagent in a subdirectory, subsequent messages in the JSONL carry the changed `cwd`. The v0.8 indexer stamped `messages.project_path` from each message's `cwd` — so a SINGLE conversation could produce rows under multiple `project_path` values, manifesting as phantom subdirectory "projects". (This was the dominant cause; subagent transcripts at `<conv-id>/subagents/agent-*.jsonl` look superficially similar but `discover()` walks only two levels, so those files were never actually indexed.)

2. **Sessions started programmatically.** Real terminal sessions emit `entrypoint: "cli"` in their attachment records; the Claude Agent SDK emits `entrypoint: "sdk-cli"`. Plugins (e.g., skill-creator scaffolding) and one-off test scripts run via the SDK with ephemeral or scaffolded `cwd` values (`/tmp/probe-*`, `~/.claude/plugins/cache/...`) the user never chose — yet they appeared in the picker as real projects.

**Fix.** Two orthogonal mechanisms, both at parse time:

1. **`project_path` locking.** The parser locks the `project_path` of every yielded row to the **first** cwd-carrying record's `cwd`. Per-message cwd shifts inside a session are transient — the session's project is defined by where Claude was started, which the first record records. A future-proofing branch (`detectSubagentParentCwd`) handles JSONLs that live under a `subagents/` directory by reading the parent JSONL's first cwd instead; today's `discover()` doesn't reach those files but the parser is robust to a future deepening.

2. **Two filterable columns on every row.** Both are exposed to picker queries; the default project list shows rows where **both** are user-initiated.
   - **`is_subagent` (v4 schema, `INTEGER NOT NULL DEFAULT 0`)** — purely path-based: `1` iff this JSONL lives under a `subagents/` directory. A filesystem fact, not a launch attribute.
   - **`entrypoint` (v5 schema, `TEXT NULL`)** — the raw value of the JSONL record's `entrypoint` field, stored verbatim. Real terminal launches yield `"cli"`; SDK launches yield `"sdk-cli"`; legacy rows that never carried the field yield `NULL`. Stored as-is so future code can filter on additional values without re-indexing.

   The default visible-session filter, applied in `searchProjects`, `recentConversations`, and `ftsSearch`:

   ```sql
   is_subagent = 0
   AND (entrypoint IS NULL OR entrypoint = 'cli')
   ```

   `NULL` is treated as `'cli'` for backward compatibility with rows indexed before the v5 column existed.

   **Future filtering surface.** Because `entrypoint` is stored raw rather than synthesized into a boolean, a future CLI flag (e.g., `multivac --entrypoint=sdk-cli`) or picker keybinding can opt into showing machine-launched sessions without further schema work. Sidechain sessions (`isSidechain: true`) are not tracked separately — empirically they appear only in subagent files, which are already filtered by `is_subagent`.

**Schema bumps v3 → v4 → v5.** v4 added `is_subagent`; v5 adds `entrypoint`. Both bumps trigger the existing drop-rebuild migration so users get the corrected `project_path` values and the new attribute on the next indexer pass. The cost is one full reindex (~5s for typical libraries on a developer laptop), amortized to the next `multivac` invocation after upgrade.

**Out of scope:** Surfacing subagent transcripts as a distinct row kind nested under their parent chat (Phase 2 — also requires deepening `discover()`). A `--entrypoint=…` filter flag for users who want to see SDK-CLI sessions (no demand yet; schema is ready).

**Rationale:** The user's mental model of "project" is "a directory I deliberately launched Claude Code from". Per-message `cwd` drift and SDK-CLI launches both violate that model — they reflect controller-side transient state or programmatic invocation, not any deliberate session-start choice. Two orthogonal columns (filesystem fact + raw attribute) keep the storage layer dumb while letting the picker query express the policy as a single composable WHERE clause.

**Alternative considered:** Excluding non-`cli` JSONLs from the index entirely. Rejected — the rows stay in the index so future opt-in surfacing doesn't require re-indexing.

**Alternative considered:** Synthesizing a single boolean column (`is_machine_launched` or similar) that ORs every signal together. Rejected — collapsing the launch attribute into a boolean throws away information. Storing `entrypoint` raw lets a future filter say "show me my SDK sessions" without needing to re-parse JSONLs.

## Testing strategy

The v0.7 test surface (128 shell tests + 43 unit tests) extends rather than replaces:

**v0.8 additions:**
- Schema v2 → v3 migration with existing v2 data (assert column presence, FTS rebuild, indexer state preserved).
- Parser captures `system/away_summary` content, `gitBranch`, `attributionSkill` into the right columns.
- Parser correctly skips other `system` subtypes (`hook_success` etc.).
- Smart preview query: returns away_summary when fresh, falls back to head-of-last-assistant when stale, falls back again when no assistant message.
- Visual snapshot tests at 80/120/200 cols (ink-testing-library).

**v0.8.1 additions:**
- `searchProjects` (renamed from `searchDirectories`) returns expected aggregation; substring filter case-insensitive on path and name; emits `kind:"project"` rows.
- `buildProjectGroups` produces the documented row ordering (project header → chats → optional more) with X sizing per mode (home: min(3, N); search-with-name-hit: max(3, matches); search-without-name-hit: matches; project hidden when X=0).
- Reducer skips `more` rows on ↑/↓; `project` and `chat` are selectable.
- `N` keybinding spawns `claude` (no `--resume`) in chat's project OR the project row's path.
- `--list` markdown output: one heading per project, embedded resume one-liners, `(N more)` footer when chats elided.
- **Subagent project_path coercion**: a subagent JSONL with `cwd=/work/frontend/packages/multivac` and a parent JSONL with `cwd=/work/frontend` produces messages with `project_path=/work/frontend`. Parent-JSONL-missing fallback verified.
- Schema v3 → v4 migration triggers drop-rebuild.

**v0.8.2 additions:**
- Linux: mock `/proc/${pid}/cwd` via a fake fs layer; assert PID → cwd → JSONL mapping.
- macOS: mock `lsof` output; assert same mapping.
- Tmux: mock `tmux list-panes` output; assert PID correlation against PPID chain.
- Active-thread refresh: PID set changes trigger re-render; unchanged PID set does not.
- `r` keypress force-refresh.
- Mapped active thread replaces chat row's icon / decorates it; unmapped thread appears above the project's chats.
- Status `live` / `idle` classification by mtime age.

CI hookup is deferred per the existing convention (`make lint-skills` does not invoke `multivac.test.sh` yet). The pre-commit `dist/` ≡ `src/` hook continues to enforce build-clean.

## Decisions log

Parked questions answered during brainstorming:

| Question | Decision |
|---|---|
| Keep "multivac" name? | **Yes, definitely.** Brand recognition, npm package name lockstep. |
| `--list` output format? | **Markdown**, project-grouped (one heading per project, chats listed under it). |
| Subagent JSONLs (`subagents/*.jsonl`) indexing? | **Index for FTS, but coerce `project_path` to the parent session's cwd** so they don't create phantom subdirectory "projects". See §D15. |
| Picker layout: two-section (working dirs ↑ chats ↓) vs. project-grouped (project header + its chats inline)? | **Project-grouped.** A chat's project is one of its primary attributes — repeating it as a separate row above duplicates information; grouping makes it structure. |
| Active threads: separate top header strip vs. inline in project group? | **Inline in project group** (mapped to a chat row when possible). Deferred to v0.8.2; spec only here. |

## Open considerations (not blocking implementation)

These should be considered during the writing-plans phase but do not change the design:

1. **Subagent JSONL discovery scoping.** v0.8.1 indexes subagent JSONLs and coerces their `project_path` to the parent session's cwd (§D15). The earlier "out of scope" note has been removed — subagents are first-class FTS content, just collapsed under their parent project for grouping purposes. Surfacing them as a separate row kind nested under the parent chat remains Phase 2 work.
2. **`away_summary` on conversations where the user runs `/config` to disable recaps.** The fallback (head-of-last-assistant) handles this correctly, but worth a test fixture.
3. **Permission mode display string.** The JSONL has `permissionMode` per message; the row metadata strip shows it as `permission=dangerous` when set to `"bypassPermissions"`. The exact label mapping needs spec'ing during implementation.
4. **macOS `lsof` parsing.** `-F n` returns null-terminated fields prefixed by `n`. Worth a fixture-test on a real macOS for the parser.
5. **`pgrep` portability.** Linux util-linux pgrep and macOS BSD pgrep differ on `-f` flag semantics around what they match. Verify the regex anchoring works on both.
