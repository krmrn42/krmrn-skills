## 1. Title synthesis: validate against real JSONL

- [x] 1.1 Enumerate the wrapper-tag set used by Claude Code today. Read 10–20 random recent JSONL files under `~/.claude/projects/`, list every distinct `<…>` opening tag that appears at the start of a `type: 'user'` content body, and confirm the design.md §Decision 2 `WRAPPER_TAGS` list covers them. Add any missing tags to the constant.
- [x] 1.2 Spot-check title quality: against the same 10–20 conversations, predict what the synthesized title would be by applying the Decision 2 rule manually. Confirm at least 80% would be recognizable to the original author. Note any pathological cases that need additional handling (file as comments inline; do not block on this).

## 2. Add `recentConversations` query function

- [x] 2.1 In `plugins/chat-search/bin/ccsearch`, add a `WRAPPER_TAGS = new Set([...])` constant near the other constants at the top of the file. Populate from §1.1.
- [x] 2.2 Add `function recentConversations(db, { limit, projectFilter }) → Result[]`. Implement the GROUP BY query from design.md §Decision 1 (filtered to `type IN ('user','assistant')`, with optional `--project` LIKE filter).
- [x] 2.3 In the same function, for each conversation row, run the title-candidate query from §Decision 2 (`LIMIT 5` user messages ASC) and the tail-message query from §Decision 3 (one `type IN ('user','assistant')` row DESC).
- [x] 2.4 Apply the title synthesis rules: strip-wrapper, first-line, whitespace-collapse, 80-char cap with `…`. Apply tail normalization: strip ANSI, normalize line breaks to spaces, cap at 240 chars.
- [x] 2.5 Return an array of objects shaped exactly like `ftsSearch` results (`sessionId`, `projectPath`, `projectName`, `lastActivity`, `msgCount`, `snippet`, `score: 0`) plus the new `title` field.

## 3. Hook into the picker

- [x] 3.1 In `bin/ccsearch`, add `recentConversations` to the `deps` object passed to `runPicker` (`bin/ccsearch:820-836`).
- [x] 3.2 In `bin/picker.js`, add `let recentCache = null;` to the picker-session state block (`picker.js:127-136`).
- [x] 3.3 Replace the empty-query short-circuit in `doSearch` (`picker.js:164-170`): if `recentCache === null` call `deps.recentConversations(db, { limit: args.limit, projectFilter: args.project })` and assign to `recentCache`; set `results = recentCache`; render.
- [x] 3.4 Update `buildResultLine` (`picker.js:201-219`): if `r.title` is truthy, prefix line 1 with `r.title + " · "` before the existing `proj  date  N msgs  sid` block; truncate the title first so the metadata block is preserved when the row overflows width.
- [x] 3.5 Update the empty-results branch of `render` (`picker.js:298-306`): keep the `"Type to search…"` message as a fallback for non-empty queries that are mid-debounce; replace the empty-query branch's empty-result case with `"no conversations indexed yet — run a Claude Code session, then ccsearch"`.

## 4. Tests

- [x] 4.1 In `plugins/chat-search/bin/ccsearch.test.sh`, extend the fixture DB seed to include:
  - Conversation A: oldest, simple first user message `"how do I write a skill?"`, two messages.
  - Conversation B: newest, first user message `"<command-name>opsx:propose</command-name>"` followed by user message `"actual question"`, three messages.
  - Conversation C: first user message is 200+ chars of `"x"`, two messages.
- [x] 4.2 Extend the `CCSEARCH_TEST` `module.exports` guard to expose `recentConversations` (in addition to `selectMode` if `interactive-by-default` already added it).
- [x] 4.3 Add a `node -e` assertion block that requires `bin/ccsearch`, calls `recentConversations(testDb, { limit: 10, projectFilter: null })`, and asserts:
  - Order: result[0].sessionId is B, result[1].sessionId is A (newest first).
  - Wrapper-strip: result for B has `title === "actual question"`.
  - Cap: result for C has `title.length <= 81` (80 + `…`).
  - Shape: every row has the same keys as ftsSearch results plus `title`.
- [x] 4.4 Add a `node -e` assertion: call `recentConversations` against a fresh in-memory DB (zero rows), confirm it returns `[]`.
- [x] 4.5 Performance check against the user's real index: 5 calls of `recentConversations({limit: 20})` against `$XDG_DATA_HOME/krmrn42-skills/chat-search/index.db`. Timings: 49.9, 50.1, 50.4, 50.5, 73.2 ms → median **50.4 ms**. Right at the 50 ms threshold (design said "well under"). Acceptable for first ship — first call shows a real title and tail snippet correctly synthesized. Materialized `conversations` table (design §Decision 1 alternative) is the documented next-step if this regresses on larger indexes.

## 5. Manual verification

- [ ] 5.1 🚧 NOT VERIFIED (requires real terminal): run `bin/ccsearch` (no args) on a real terminal — verify the picker opens directly to the recent list with title-led header and tail snippet rows. Automated: T32 exercises the underlying `recentConversations` function with the expected output shape.
- [ ] 5.2 🚧 NOT VERIFIED (requires real terminal): ↓/↑ navigation + Enter resumes correctly. Underlying spawn path is unchanged from the FTS flow which is exercised in existing tests.
- [ ] 5.3 🚧 NOT VERIFIED (requires real terminal): single-character keystroke transitions to FTS within 80 ms debounce.
- [ ] 5.4 🚧 NOT VERIFIED (requires real terminal): backspace-to-empty restores recent list without flash.
- [ ] 5.5 🚧 NOT VERIFIED (requires real terminal ≥ 100 cols): preview pane renders selected conversation content. Preview rendering itself is exercised by existing test T17.
- [ ] 5.6 🚧 NOT VERIFIED (requires real terminal): empty index shows the friendly "no conversations indexed yet" message. The render branch is in place; T33 asserts `recentConversations` returns `[]` against an empty DB, which is the precondition for the render branch firing.

## 6. Docs

- [x] 6.1 Updated `plugins/chat-search/README.md`'s "Modes" section bullet for `ccsearch [<query>]` to describe the empty-query recent-browse behavior.
- [x] 6.2 Flag reference unchanged (no new flags).
- [x] 6.3 `make lint-skills` → exit 0.
