## Why

Recent-browse orders conversations by recency, which is the right default. But every heavy user has a small set of conversations they actively return to — a long-running design discussion, the conversation that has the production runbook, the spec'ing session that other work depends on. Those don't deserve to drift down the list as newer (often shorter, less important) conversations push them off-screen. Pinning is the conventional UI move: a small set of user-chosen rows that always appear at the top.

## What Changes

- New picker keybinding **Ctrl+P** ("pin") on a selected row: toggles whether the row's session id is in the `pins` array of `sessions.json`. No prompt, no confirmation — toggle is the right grain.
- Pinned session ids are stored in `sessions.json.pins`, an array of session-id strings preserving the order in which they were pinned. The file schema and atomic-write semantics are the same ones established by `picker-rename-session`; this change adds reads + writes to the `pins` key alongside the `names` key.
- Rendering in recent-browse: pinned rows appear at the top of the list, in pin order (most recently pinned first), followed by a single dim separator line `── recent ──` (centered or left-aligned), followed by the non-pinned rows in their existing most-recent-first order. The total visible row count remains bounded by `args.limit`; pinned rows count toward the limit so a user who pins 20 sessions and runs `ccsearch --limit 20` sees only pins.
- Rendering in FTS results: pinned rows that match the query appear at the top of the search results (also in pin order), followed by the BM25-ranked non-pinned matches. Pinned rows that don't match the query are NOT shown — pinning doesn't override the query, it just promotes pinned matches above ranked matches.
- A visual indicator on pinned rows: a small `📌` glyph (or `*` if `--no-color` / falling back to ASCII) at the start of line 1, before the title.
- New CLI flag `--unpin-all` for cleanup: removes all pins from `sessions.json` and exits. Useful when the pin list grows stale.
- The `--print-names` flag (added by `picker-rename-session`) is renamed conceptually to `--print-session-config` because it now also covers pins. We keep `--print-names` as a backward-compat alias.

## Capabilities

### New Capabilities

- `ccsearch-session-pin`: Defines the pin keybinding, the `pins` array semantics in `sessions.json`, the ordering rules for both recent-browse and FTS modes, the visual indicator, and the `--unpin-all` cleanup command.

### Modified Capabilities

- `ccsearch-recent-browse`: Modify the result-set ordering to put pinned-and-matching rows first, the rest in their existing order, separated by a divider.
- `ccsearch-session-rename`: The `--print-names` flag from that change is documented as also covering pins (or aliased from a new `--print-session-config`); the file's `pins` key is now read-and-written.

## Impact

- **Code**: `plugins/chat-search/bin/ccsearch` — `recentConversations` re-orders its result set; new `case "--unpin-all":` in parser. `plugins/chat-search/bin/picker.js` — Ctrl+P handler that toggles a pin via `saveSessionStore`, in-place result-list re-order, and a divider-rendering branch in `render`.
- **Tests**: `bin/ccsearch.test.sh` — assert pin ordering in recent-browse output; assert Ctrl+P toggles via the in-memory session store; assert `--unpin-all` empties the array.
- **Docs**: README — Ctrl+P entry in keybindings; `--unpin-all` in flag reference; describe the divider and ordering rules.
- **Users**: Zero impact until first Ctrl+P. After that: pinned rows always at top of recent-browse, always at top of matching FTS results.
- **Risk**: Low. Pin/unpin is a single boolean toggle. The visual divider adds one render branch.
