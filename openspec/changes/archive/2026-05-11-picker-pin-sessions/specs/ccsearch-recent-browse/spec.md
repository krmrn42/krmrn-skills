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
