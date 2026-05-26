# multivac-recent-browse Specification

## Purpose
TBD - created by archiving change browse-recent-on-empty-query. Update Purpose after archive.
## Requirements
### Requirement: Empty query opens a recent-conversations browser

When the picker is rendered and the current query string is empty (after `.trim()`), `multivac` SHALL populate the result list with the N most recent conversations across all indexed projects. Within that result set, pinned rows (per `sessions.json.pins`) MUST render first (in pin-order, most-recently-pinned first), followed by a dim divider `── recent ──`, followed by the remaining conversations ordered by the timestamp of each conversation's most recent message (DESC). The combined count of pinned + non-pinned rows MUST NOT exceed `args.limit` (default `20`, overridable via `--limit`).

#### Scenario: No pins — original recent-browse behavior

- **WHEN** the user has no pinned rows and runs `multivac` on a TTY
- **THEN** the picker shows up to 20 rows ordered most-recent-first, identical to pre-change behavior

#### Scenario: Pinned rows surface in recent-browse

- **WHEN** the user has pinned 2 rows and runs `multivac` on a TTY with `--limit 10`
- **THEN** the picker shows the 2 pinned rows at the top (newest pin first), then the divider, then up to 8 most-recent non-pinned rows

#### Scenario: Empty index still shows guidance

- **WHEN** the index contains zero conversations and the user runs `multivac`
- **THEN** the picker shows the existing "no conversations indexed yet" message
- **AND** no divider is rendered

#### Scenario: --limit changes the recent count (unchanged)

- **WHEN** the user runs `multivac --limit 5` on an interactive TTY
- **THEN** the total visible row count (pins + recents) is capped at 5

### Requirement: Each recent row shows a synthesized title plus tail snippet

Each row in the recent-browse view SHALL show two visual lines:

- **Line 1** (header): The **display title** for the conversation, followed by a metadata suffix containing project name, date, message count, and short session id. The display title precedence is: (1) saved name from `sessions.json` if present; (2) the synthesized title from the first non-wrapper user message, truncated to 80 chars; (3) if neither exists, no leading title and line 1 starts with the metadata.
- **Line 2** (snippet): The **tail snippet** — the last 1-2 visual lines of the most recent user-or-assistant message of the conversation, plain-text (no FTS highlighting), dimmed with the same styling the existing FTS snippet uses.

If the most recent message is empty or contains only wrapper content, the next-most-recent user/assistant message is used. If no usable message exists, line 2 MUST be omitted (single-line row) rather than displaying a blank line.

#### Scenario: Saved name takes precedence over synthesized title

- **WHEN** a conversation has both a synthesized title and a saved name in `sessions.json`
- **THEN** line 1 leads with the saved name
- **AND** the synthesized title is not shown anywhere on the row

#### Scenario: Synthesized title used when no saved name

- **WHEN** a conversation has no entry in `sessions.json` but has a usable first user message
- **THEN** line 1 leads with the synthesized title (current pre-change behavior)

#### Scenario: Metadata-only row when neither exists

- **WHEN** a conversation has no saved name and no usable user message for synthesis
- **THEN** line 1 starts with the metadata suffix (`<proj>  <date>  <N> msgs  <short-id>`), no leading title

#### Scenario: Title comes from first user message (unchanged)

- **WHEN** a conversation has no saved name, and its first user message is `"How do I write a custom Claude Code skill?"`
- **THEN** the row's line 1 begins with `"How do I write a custom Claude Code skill?"` (possibly truncated with `…`), followed by ` · <project> · <date> · <N> msgs · <short-id>`

#### Scenario: Wrapper messages skipped during title synthesis (unchanged)

- **WHEN** a conversation has no saved name and its first user message content starts with a recognized wrapper marker
- **THEN** the synthesized title comes from the next user message that is not a wrapper

#### Scenario: Tail snippet shows last conversation content (unchanged)

- **WHEN** the user views the recent-browse list
- **THEN** each row's line 2 is the last 1-2 visual lines of the most recent user-or-assistant message in that conversation

#### Scenario: Empty tail collapses to one-line row (unchanged)

- **WHEN** a conversation's most recent message has empty content and no earlier user/assistant message has usable text
- **THEN** the row renders as a single header line (no blank snippet line beneath it)

### Requirement: All existing picker keybindings work in recent-browse

All keybindings supported in FTS mode (arrow navigation, Enter to resume, Ctrl-F to fork, Ctrl-O to print session id, Ctrl-D to print project path, Esc to cancel) SHALL apply identically to recent-browse rows.

#### Scenario: Enter resumes the selected recent conversation

- **WHEN** the user navigates to a recent row and presses Enter
- **THEN** the picker exits with the same `exitReason.type === "resume"` behavior used by FTS rows
- **AND** the calling shell receives a `cd <project_path> && claude --resume <session_id>` invocation (consistent with the existing resume flow)

#### Scenario: Ctrl-F forks the selected recent conversation

- **WHEN** the user navigates to a recent row and presses Ctrl-F
- **THEN** the picker exits with `exitReason.type === "fork"` (existing fork flow), identical to FTS rows

#### Scenario: Arrow keys navigate recent rows

- **WHEN** the user presses ↓ at the bottom of the visible window in recent-browse
- **THEN** the scroll offset advances, exposing the next recent row, exactly as in FTS mode

### Requirement: Transitions between recent and FTS are silent and immediate

The picker SHALL switch from recent-browse to FTS results on the first keystroke that produces a non-empty trimmed query, and SHALL switch back to recent-browse when the query becomes empty again (e.g., backspace). The transition MUST NOT cause the picker to redraw a "blank" or "loading" intermediate state visible to the user; recent results MAY be cached after the first render and reused on re-entry within the same picker session.

#### Scenario: Typing first character switches to FTS

- **WHEN** the picker is showing the recent-browse list and the user types `s`
- **THEN** the picker schedules an FTS search for `"s"` (debounced as today, 80 ms)
- **AND** the recent list is no longer visible after the FTS results render

#### Scenario: Backspace to empty switches back to recent

- **WHEN** the picker is showing FTS results for query `"s"` and the user presses Backspace
- **THEN** the recent-browse list is shown again
- **AND** the cursor returns to row 0 (top of recent list)
- **AND** no `"Searching…"` placeholder is rendered between FTS and recent

#### Scenario: Re-entering empty state does not re-query DB

- **WHEN** the user has already entered recent-browse once in this picker session and re-enters it via backspace-to-empty
- **THEN** the recent list is served from the in-process cache (no additional SQL queries hit the DB for the recent list itself; preview-pane queries are unchanged)

### Requirement: Recent-browse view does not interfere with one-shot mode

The recent-browse behavior is picker-only. `runOneShot` (`--list`, `--format`, redirected stdout, etc.) MUST NOT be affected by this change — its empty-query behavior remains the existing `"no query provided"` error, and adding a recent listing to one-shot is explicitly out of scope.

#### Scenario: --list with no query still errors

- **WHEN** the user runs `multivac --list` (no positional query) on a TTY
- **THEN** the process exits with `EXIT_USER` (`1`) and the existing `"no query provided"` message
- **AND** no recent listing is printed

#### Scenario: Piped invocation with no query still errors

- **WHEN** the user runs `multivac | cat` (no positional query, stdout piped)
- **THEN** the process exits with `EXIT_USER` (`1`) and the existing `"no query provided"` message

