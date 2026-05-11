# ccsearch-picker-status-bar Specification

## Purpose
TBD - created by archiving change picker-status-bar. Update Purpose after archive.
## Requirements
### Requirement: Status bar lists every visible picker binding

The picker SHALL render a status bar on row 2 (above the result list) listing every binding from the `BINDINGS` table whose `visible(deps)` predicate returns true. Each binding renders as `<key> <label>` (e.g., `"Ctrl-R rename"`). Bindings are grouped by category and rendered in fixed category order: `resume → action → dangerous → navigation`.

#### Scenario: All bindings appear on a wide terminal

- **WHEN** the user opens the picker on an 120-column terminal with the dangerous-resume capability armed and `$TMUX` set
- **THEN** the status bar shows entries for: Enter (resume), Alt-Enter / Shift-Enter (dangerous), Ctrl-T (remote-control), Ctrl-W (tmux window), Ctrl-R (rename), Ctrl-P (pin), Ctrl-F (fork), Ctrl-O (print id), Ctrl-D (print path), arrow keys (nav), Esc (cancel), `?` (help)

#### Scenario: Bindings ordering follows category, not alphabet

- **WHEN** the status bar renders
- **THEN** within each line, resume bindings appear first, then action bindings, then dangerous, then navigation

### Requirement: Context-dependent bindings appear only when applicable

Each binding's `visible(deps)` predicate determines whether it appears in the status bar. Specifically: the dangerous-resume entry MUST appear only when `deps.dangerouslySkipPermissions === true`; the tmux-window entry MUST appear only when `deps.tmuxAvailable === true` (i.e., `$TMUX` is set and `--no-tmux` was not passed). Bindings without context preconditions (rename, pin, fork, etc.) MUST always be visible.

#### Scenario: Dangerous entry hidden when not armed

- **WHEN** the user runs `ccsearch` without `--dangerously-skip-permissions`
- **THEN** the status bar does NOT include an "Alt-Enter" or "Shift-Enter" entry
- **AND** Alt+Enter functionally falls through to plain resume (existing behavior)

#### Scenario: Tmux entry hidden outside tmux

- **WHEN** `$TMUX` is unset (or `--no-tmux` is passed)
- **THEN** the status bar does NOT include a "Ctrl-W" entry

### Requirement: Per-category styling

The status bar SHALL style bindings by category using ANSI colors: `resume` bindings in default (no explicit color), `action` bindings in cyan, `dangerous` bindings in yellow, `navigation` bindings in dim. The entire status bar is rendered inside a dim outer envelope (matching the current pre-change help-line styling); the per-category color codes open/close at category boundaries.

#### Scenario: Dangerous entry rendered in yellow

- **WHEN** the dangerous capability is armed and the status bar renders
- **THEN** the Alt-Enter entry appears in yellow

#### Scenario: Action entries rendered in cyan

- **WHEN** the status bar renders
- **THEN** Ctrl-R, Ctrl-P, Ctrl-W (when visible), Ctrl-T, Ctrl-F, Ctrl-O, Ctrl-D entries appear in cyan

### Requirement: Narrow-width wrapping

When the visible bindings' rendered length exceeds the terminal width (`cols`), the status bar SHALL wrap to 2 lines, with navigation bindings dropped from the first line and rendered alone on the second. If 2 lines still don't fit, the bar is split at the nearest category boundary that fits the available width. Terminals below 40 columns trigger the picker's existing "terminal too small" message instead.

#### Scenario: Single-line fit at wide terminal

- **WHEN** all visible bindings fit in `cols` characters
- **THEN** the status bar renders as a single line on row 2
- **AND** the body region starts on row 4 (unchanged from current layout)

#### Scenario: Two-line wrap at moderate width

- **WHEN** all visible bindings exceed `cols` but the non-navigation subset fits
- **THEN** line 1 (row 2) shows resume + action + dangerous bindings
- **AND** line 2 (row 3) shows navigation bindings
- **AND** the body region starts on row 5 (one row lower than the single-line case)

#### Scenario: Picker too small for the bar

- **WHEN** `cols < 40`
- **THEN** the picker's existing "terminal too small (need ≥ 40×6)" fallback message renders
- **AND** no status bar attempt is made

### Requirement: `?` opens a transient binding-reference overlay

When the picker is in browse mode (not in rename-input mode) and the user presses `?`, the picker SHALL enter a help mode that replaces the result list with a vertical listing of every BINDINGS entry and its `longHelp` description. Pressing any key dismisses help mode and returns the picker to its previous state (same cursor position, same query, same result list).

#### Scenario: `?` opens help overlay

- **WHEN** the user is in browse mode and presses `?`
- **THEN** the body region shows a list of every binding with its long-form description
- **AND** the prompt line (row 1) and status bar (row 2) remain visible
- **AND** the cursor position is preserved (not visible during help mode but restored on dismiss)

#### Scenario: Any key dismisses help

- **WHEN** the user is in help mode and presses any key
- **THEN** the picker returns to browse mode with the prior state restored
- **AND** the keystroke that dismissed help is NOT also processed as a picker command (Esc, Enter, etc. only dismiss; they do not also fire their normal action)

#### Scenario: `?` while typing a query is just text

- **WHEN** the user has a non-empty query (typing into the search box) and presses `?`
- **THEN** `?` is appended to the query (treated as a printable character)
- **AND** help mode does NOT open

### Requirement: BINDINGS table and `onKeypress` MUST stay in sync

A test SHALL fail if any keypress handler in `onKeypress` does not have a corresponding entry in the BINDINGS table, or vice versa. The check parses the source for keystroke patterns (the picker analog of the `improve-ccsearch-help` drift-guard test).

#### Scenario: New handler without BINDINGS entry trips the test

- **WHEN** a contributor adds a new `if (key.ctrl && key.name === "x")` branch to `onKeypress` without appending a BINDINGS row
- **THEN** the test fails with a message naming the orphan keystroke

#### Scenario: New BINDINGS row without handler trips the test

- **WHEN** a contributor adds a BINDINGS row referencing a keystroke not handled by `onKeypress`
- **THEN** the test fails with a message naming the phantom binding

