## ADDED Requirements

### Requirement: Empty query opens a recent-conversations browser

When the picker is rendered and the current query string is empty (after `.trim()`), `ccsearch` SHALL populate the result list with the N most recent conversations across all indexed projects, ordered by the timestamp of each conversation's most recent message (DESC). N MUST equal `args.limit` (default `20`, overridable via `--limit`).

#### Scenario: Bare ccsearch on a TTY shows recent conversations

- **WHEN** the user runs `ccsearch` on an interactive TTY and no conversation has been typed
- **THEN** the picker body shows up to 20 rows, each representing one conversation, sorted by most-recent activity
- **AND** the placeholder text `"Type to search…"` does NOT appear in place of the result list
- **AND** the footer reflects the row count (e.g., `"20 results"`)

#### Scenario: --limit changes the recent count

- **WHEN** the user runs `ccsearch --limit 5` on an interactive TTY
- **THEN** the picker shows up to 5 recent conversations, not 20

#### Scenario: Empty index shows guidance, not a hang

- **WHEN** the index contains zero conversations and the user runs `ccsearch` on a TTY
- **THEN** the picker body shows a single message such as `"no conversations indexed yet — run a Claude Code session, then ccsearch"`
- **AND** the picker remains responsive to Esc / arrow keys / typing

### Requirement: Each recent row shows a synthesized title plus tail snippet

Each row in the recent-browse view SHALL show two visual lines:

- **Line 1** (header): a synthesized **title** for the conversation (first non-wrapper user message, truncated to a sensible width — see Decision 2 in design), followed by a metadata suffix containing project name, date, message count, and short session id, in that order. When the line would overflow the available width, the title is truncated with `…` and the metadata suffix is preserved.
- **Line 2** (snippet): the **tail snippet** — the last 1-2 visual lines of the most recent user-or-assistant message of the conversation, plain-text (no FTS highlighting), dimmed with the same styling the existing FTS snippet uses.

If the most recent message is empty or contains only wrapper content, the next-most-recent user/assistant message is used. If no usable message exists, line 2 MUST be omitted (single-line row) rather than displaying a blank line.

#### Scenario: Title comes from first user message

- **WHEN** a conversation's first user message is `"How do I write a custom Claude Code skill?"` and the user opens the picker (empty query)
- **THEN** the row's line 1 begins with `"How do I write a custom Claude Code skill?"` (possibly truncated with `…`), followed by ` · <project> · <date> · <N> msgs · <short-id>`

#### Scenario: Wrapper messages skipped during title synthesis

- **WHEN** a conversation's first user message content starts with one of the recognized wrapper markers (e.g., `<command-name>`, `<command-message>`, `<local-command-stdout>`, `<stdin>`)
- **THEN** the synthesized title comes from the next user message that is not a wrapper
- **AND** the row's line 1 does NOT begin with `<`

#### Scenario: Tail snippet shows last conversation content

- **WHEN** the user views the recent-browse list
- **THEN** each row's line 2 is the last 1-2 visual lines of the most recent user-or-assistant message in that conversation, truncated to fit width, with line breaks normalized to spaces
- **AND** the snippet does NOT contain ANSI color codes from any search-match highlighting (there is no query)

#### Scenario: Empty tail collapses to one-line row

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

- **WHEN** the user runs `ccsearch --list` (no positional query) on a TTY
- **THEN** the process exits with `EXIT_USER` (`1`) and the existing `"no query provided"` message
- **AND** no recent listing is printed

#### Scenario: Piped invocation with no query still errors

- **WHEN** the user runs `ccsearch | cat` (no positional query, stdout piped)
- **THEN** the process exits with `EXIT_USER` (`1`) and the existing `"no query provided"` message
