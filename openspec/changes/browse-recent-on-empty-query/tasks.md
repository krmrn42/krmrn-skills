## 1. Title synthesis: validate against real JSONL

- [ ] 1.1 Enumerate the wrapper-tag set used by Claude Code today. Read 10–20 random recent JSONL files under `~/.claude/projects/`, list every distinct `<…>` opening tag that appears at the start of a `type: 'user'` content body, and confirm the design.md §Decision 2 `WRAPPER_TAGS` list covers them. Add any missing tags to the constant.
- [ ] 1.2 Spot-check title quality: against the same 10–20 conversations, predict what the synthesized title would be by applying the Decision 2 rule manually. Confirm at least 80% would be recognizable to the original author. Note any pathological cases that need additional handling (file as comments inline; do not block on this).

## 2. Add `recentConversations` query function

- [ ] 2.1 In `plugins/chat-search/bin/ccsearch`, add a `WRAPPER_TAGS = new Set([...])` constant near the other constants at the top of the file. Populate from §1.1.
- [ ] 2.2 Add `function recentConversations(db, { limit, projectFilter }) → Result[]`. Implement the GROUP BY query from design.md §Decision 1 (filtered to `type IN ('user','assistant')`, with optional `--project` LIKE filter).
- [ ] 2.3 In the same function, for each conversation row, run the title-candidate query from §Decision 2 (`LIMIT 5` user messages ASC) and the tail-message query from §Decision 3 (one `type IN ('user','assistant')` row DESC).
- [ ] 2.4 Apply the title synthesis rules: strip-wrapper, first-line, whitespace-collapse, 80-char cap with `…`. Apply tail normalization: strip ANSI, normalize line breaks to spaces, cap at 240 chars.
- [ ] 2.5 Return an array of objects shaped exactly like `ftsSearch` results (`sessionId`, `projectPath`, `projectName`, `lastActivity`, `msgCount`, `snippet`, `score: 0`) plus the new `title` field.

## 3. Hook into the picker

- [ ] 3.1 In `bin/ccsearch`, add `recentConversations` to the `deps` object passed to `runPicker` (`bin/ccsearch:820-836`).
- [ ] 3.2 In `bin/picker.js`, add `let recentCache = null;` to the picker-session state block (`picker.js:127-136`).
- [ ] 3.3 Replace the empty-query short-circuit in `doSearch` (`picker.js:164-170`): if `recentCache === null` call `deps.recentConversations(db, { limit: args.limit, projectFilter: args.project })` and assign to `recentCache`; set `results = recentCache`; render.
- [ ] 3.4 Update `buildResultLine` (`picker.js:201-219`): if `r.title` is truthy, prefix line 1 with `r.title + " · "` before the existing `proj  date  N msgs  sid` block; truncate the title first so the metadata block is preserved when the row overflows width.
- [ ] 3.5 Update the empty-results branch of `render` (`picker.js:298-306`): keep the `"Type to search…"` message as a fallback for non-empty queries that are mid-debounce; replace the empty-query branch's empty-result case with `"no conversations indexed yet — run a Claude Code session, then ccsearch"`.

## 4. Tests

- [ ] 4.1 In `plugins/chat-search/bin/ccsearch.test.sh`, extend the fixture DB seed to include:
  - Conversation A: oldest, simple first user message `"how do I write a skill?"`, two messages.
  - Conversation B: newest, first user message `"<command-name>opsx:propose</command-name>"` followed by user message `"actual question"`, three messages.
  - Conversation C: first user message is 200+ chars of `"x"`, two messages.
- [ ] 4.2 Extend the `CCSEARCH_TEST` `module.exports` guard to expose `recentConversations` (in addition to `selectMode` if `interactive-by-default` already added it).
- [ ] 4.3 Add a `node -e` assertion block that requires `bin/ccsearch`, calls `recentConversations(testDb, { limit: 10, projectFilter: null })`, and asserts:
  - Order: result[0].sessionId is B, result[1].sessionId is A (newest first).
  - Wrapper-strip: result for B has `title === "actual question"`.
  - Cap: result for C has `title.length <= 81` (80 + `…`).
  - Shape: every row has the same keys as ftsSearch results plus `title`.
- [ ] 4.4 Add a `node -e` assertion: call `recentConversations` against a fresh in-memory DB (zero rows), confirm it returns `[]`.
- [ ] 4.5 Performance check: against the user's real index (`$XDG_DATA_HOME/krmrn42-skills/chat-search/index.db`), time three `recentConversations({limit: 20})` calls in a row from a `node -e` snippet, confirm the median is under 50 ms. If above, profile the GROUP BY and consider an index hint or denormalization (revisit design.md §Decision 1's alternative).

## 5. Manual verification

- [ ] 5.1 Run `bin/ccsearch` (no args) on a real terminal — verify the picker opens directly to a recent-conversations list, with each row showing a title-led header and a tail snippet.
- [ ] 5.2 Use ↓/↑ to navigate, press Enter on a row — verify the shell resumes the correct session in the correct project directory.
- [ ] 5.3 Type a single character — verify the recent list is replaced by FTS results within ~80 ms (debounce window).
- [ ] 5.4 Backspace to empty query — verify the recent list returns without a visible flash or `"Searching…"` placeholder.
- [ ] 5.5 Resize the terminal to ≥ 100 cols — verify the preview pane appears and shows the selected conversation's content.
- [ ] 5.6 With an empty/fresh index DB (or `--db-path /tmp/empty.db` pointing at an empty file the indexer initializes), confirm the picker shows the friendly "no conversations indexed yet" message rather than hanging or erroring.

## 6. Docs

- [ ] 6.1 Update `plugins/chat-search/README.md`: under the "Modes" / "Picker" section, add a paragraph describing the empty-query recent-browse behavior. Example screenshot or sample output line is helpful but not required.
- [ ] 6.2 Keep the flag reference unchanged (no new flags introduced by this change).
- [ ] 6.3 Run `make lint-skills-strict` from the repo root to confirm no skill / manifest regressions.
