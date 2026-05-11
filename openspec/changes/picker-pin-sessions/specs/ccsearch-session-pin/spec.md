## ADDED Requirements

### Requirement: Ctrl+P toggles pin state for the selected row

When the picker is in browse mode and a row is selected, pressing **Ctrl+P** SHALL toggle the pin state for that row's session id. Toggling is immediate (no confirmation): if the id is in `sessions.json.pins`, remove it; otherwise prepend it (so the most recently pinned row is first in the array). The picker MUST re-render to reflect the new ordering on the next render cycle, and the previously selected row MUST remain selected (cursor follows the row's new position).

#### Scenario: Ctrl+P on an unpinned row pins it

- **WHEN** the user has the picker open on an unpinned row and presses Ctrl+P
- **THEN** the row's session id is prepended to `sessions.json.pins`
- **AND** the row is rendered with the pin indicator (`📌` or `*` with --no-color) at the start of line 1
- **AND** the row moves to the top of the result list (in pin-order with any other pinned rows)
- **AND** the cursor stays on the same row (which is now at the new position)

#### Scenario: Ctrl+P on a pinned row unpins it

- **WHEN** the user has the picker open on a pinned row and presses Ctrl+P
- **THEN** the row's session id is removed from `sessions.json.pins`
- **AND** the pin indicator disappears from line 1
- **AND** the row drops below the divider into its natural recent/ranked position

### Requirement: Pinned rows render first, separated by a divider

In recent-browse mode and in FTS results mode, pinned rows that are part of the result set SHALL render first (in `sessions.json.pins` order — most recently pinned first), followed by a single dim divider row, followed by the remaining rows in their existing order (recent-most-first for recent-browse; BM25-ranked for FTS). The divider reads `── recent ──` in recent-browse and `── results ──` in FTS mode. The cursor MUST NOT be able to land on the divider; Up/Down navigation skips over it.

#### Scenario: Recent-browse with pinned rows

- **WHEN** the user has pinned rows X and Y and the recent-browse result set also includes recent rows A, B, C
- **THEN** the rendered order is X, Y, divider, A, B, C
- **AND** pressing Down from Y advances directly to A (skipping the divider)
- **AND** pressing Up from A returns directly to Y

#### Scenario: FTS-mode divider says "results"

- **WHEN** the user has pinned rows and types a query that matches some
- **THEN** the divider line reads `── results ──` rather than `── recent ──`

#### Scenario: No divider when there are no pins

- **WHEN** the user has no pinned rows
- **THEN** the result list renders without a divider, identical to pre-change behavior

#### Scenario: No divider when ALL visible rows are pinned

- **WHEN** every row in the result set is pinned (e.g., user pinned 20 sessions and `--limit 5` shows 5 pins, no recent rows)
- **THEN** no divider is rendered

### Requirement: Pinning does NOT override the FTS query

In FTS mode, pinned rows that do NOT match the query MUST NOT be shown. Pinning promotes pinned matches above ranked matches; it does not bypass the query filter.

#### Scenario: Pinned row not matching query is hidden

- **WHEN** the user has pinned row X (about "deployment"), types query "auth"
- **THEN** row X is NOT in the rendered result set unless its content matches "auth"

#### Scenario: Pinned row matching query is lifted to top

- **WHEN** the user has pinned row X and X's content matches the typed query
- **THEN** X appears at the top of the FTS results regardless of its BM25 score

### Requirement: Pinned rows count toward `--limit`

The total visible rows in any mode (pinned + non-pinned, excluding the divider) MUST NOT exceed `args.limit`. When pins fill the limit, fewer (or zero) non-pinned rows render.

#### Scenario: Pinned rows fill the limit

- **WHEN** `args.limit = 5` and the user has 4 pinned rows in the result set
- **THEN** the picker shows 4 pinned rows + 1 non-pinned row + divider, totaling 5 result rows

#### Scenario: More pins than the limit

- **WHEN** `args.limit = 5` and the user has 7 pinned rows in the result set
- **THEN** only the 5 most recently pinned rows render
- **AND** no divider is rendered (no non-pinned rows)

### Requirement: `--unpin-all` removes every pin and exits

`ccsearch --unpin-all` SHALL set `sessions.json.pins = []` and exit `0`, even if the file did not previously exist (in which case it creates an empty-pins file). The flag MUST NOT touch `names` or any other field.

#### Scenario: Unpins everything

- **WHEN** the user runs `ccsearch --unpin-all` with `sessions.json.pins = ["A","B","C"]`
- **THEN** after the command exits, `sessions.json.pins` equals `[]`
- **AND** `sessions.json.names` is unchanged
- **AND** the process exits `0`

#### Scenario: Idempotent on already-empty state

- **WHEN** the user runs `ccsearch --unpin-all` and there are no pins
- **THEN** the command exits `0` with `sessions.json.pins` still `[]`

#### Scenario: Creates the file when missing

- **WHEN** the user runs `ccsearch --unpin-all` and `sessions.json` does not exist
- **THEN** the command creates `sessions.json` with `{ "version": 1, "names": {}, "pins": [] }`
- **AND** exits `0`

## MODIFIED Requirements

### Requirement: Empty query opens a recent-conversations browser

When the picker is rendered and the current query string is empty (after `.trim()`), `ccsearch` SHALL populate the result list with the N most recent conversations across all indexed projects. Within that result set, pinned rows (per `sessions.json.pins`) MUST render first (in pin-order, most-recently-pinned first), followed by a dim divider `── recent ──`, followed by the remaining conversations ordered by the timestamp of each conversation's most recent message (DESC). The combined count of pinned + non-pinned rows MUST NOT exceed `args.limit` (default `20`, overridable via `--limit`).

#### Scenario: No pins — original recent-browse behavior

- **WHEN** the user has no pinned rows and runs `ccsearch` on a TTY
- **THEN** the picker shows up to 20 rows ordered most-recent-first, identical to pre-change behavior

#### Scenario: Pinned rows surface in recent-browse

- **WHEN** the user has pinned 2 rows and runs `ccsearch` on a TTY with `--limit 10`
- **THEN** the picker shows the 2 pinned rows at the top (newest pin first), then the divider, then up to 8 most-recent non-pinned rows

#### Scenario: Empty index still shows guidance

- **WHEN** the index contains zero conversations and the user runs `ccsearch`
- **THEN** the picker shows the existing "no conversations indexed yet" message
- **AND** no divider is rendered

#### Scenario: --limit changes the recent count (unchanged)

- **WHEN** the user runs `ccsearch --limit 5` on an interactive TTY
- **THEN** the total visible row count (pins + recents) is capped at 5
