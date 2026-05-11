## 1. Parser

- [ ] 1.1 In `parseArgs`, add `args.unpinAll = false` default; new `case "--unpin-all":` branch.
- [ ] 1.2 Add OPTIONS table entry for `--unpin-all` under the "Index management" group.

## 2. Pin-aware ordering

- [ ] 2.1 In `recentConversations`, after the base GROUP BY query, partition rows into `pinned` and `recent` according to whether their session id is in `store.pins`. Return `pinned` (ordered by their position in `store.pins`) followed by `recent` (existing most-recent-first). Total capped at `limit`; pinned rows count toward the cap.
- [ ] 2.2 In `ftsSearch`, after producing the BM25-ordered result set, similarly partition into `pinned-matching` (preserving `store.pins` order) and `non-pinned-matching` (preserving BM25 order). Pinned rows that don't appear in the FTS result set are NOT injected.
- [ ] 2.3 Attach `r.isPinned = true | false` on each row so the picker can render the indicator without re-checking the store.

## 3. Picker rendering

- [ ] 3.1 Add Ctrl+P branch in `onKeypress` (browse mode only): toggle the session id in the in-memory `store.pins`, call `deps.saveSessionStore`, re-run the current search (so ordering updates), keep cursor on the same row by tracking session id across the re-ordering.
- [ ] 3.2 In `buildResultLine`, prepend `📌 ` (or `* ` when `args.noColor`) to line 1 when `r.isPinned`.
- [ ] 3.3 In `render`, after rendering pinned rows, render a single dim divider line. The divider must be a special row that `move(±)` skips over. Implementation: insert a sentinel `{ divider: true }` into the visible-rows list; arrow-navigation iterates with a step that skips dividers; `maxVisible` budgets the divider as one visual row.
- [ ] 3.4 Compute divider text based on mode: `── results ──` when query is non-empty, `── recent ──` when empty.

## 4. `--unpin-all` handler

- [ ] 4.1 In `main()`, after `parseArgs` but before any DB work, if `args.unpinAll`: load the store, set `store.pins = []`, save it, exit `EXIT_OK`. Stdout: print "ccsearch: cleared N pins" (where N is the old length) for confirmation.

## 5. Tests

- [ ] 5.1 Pin ordering test: write a `sessions.json` with `pins: ["conv-B", "conv-A"]`, then call `recentConversations` against the fixture DB with conv-A, conv-B, conv-C indexed. Assert returned order is conv-B, conv-A, conv-C (pinned in pin-order, then recents).
- [ ] 5.2 Pin-doesn't-override-query test: pin a row that doesn't match a search query; assert FTS results don't include it.
- [ ] 5.3 `--unpin-all` test: write a sessions.json with 3 pins, run `--unpin-all`, assert pins are `[]` and names are unchanged.
- [ ] 5.4 `--limit` interaction test: pin 4 rows, run `recentConversations({ limit: 3 })`, assert exactly 3 pinned rows returned (most-recently-pinned first), zero recents.

## 6. Manual verification

- [ ] 6.1 🚧 NOT VERIFIED (requires real terminal): Ctrl+P on a row pins it; row moves to top with `📌`; sessions.json updated.
- [ ] 6.2 🚧 NOT VERIFIED (requires real terminal): divider renders correctly; Up/Down skip over it.
- [ ] 6.3 🚧 NOT VERIFIED (requires real terminal): typing a query that doesn't match a pinned row hides that pin.
- [ ] 6.4 🚧 NOT VERIFIED (requires real terminal): `--no-color` falls back to `*` indicator.

## 7. Docs

- [ ] 7.1 README: add Ctrl+P to picker keybindings; describe the divider and pin ordering rules.
- [ ] 7.2 README: add `--unpin-all` to the flag reference table.
- [ ] 7.3 Update the `--print-names` description (introduced by `picker-rename-session`) to mention that the printed JSON now also includes the `pins` array.
- [ ] 7.4 `make lint-skills` → exit 0.
