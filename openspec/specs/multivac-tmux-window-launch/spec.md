# multivac-tmux-window-launch Specification

## Purpose
TBD - created by archiving change picker-tmux-new-window. Update Purpose after archive.
## Requirements
### Requirement: Ctrl+W spawns the resume in a new tmux window

When `$TMUX` is set in the environment (and `--no-tmux` is not passed) and the picker is in browse mode with a row selected, pressing **Ctrl+W** SHALL invoke `tmux new-window` with the appropriate arguments to start `claude --resume <session-id>` in the row's project directory. The picker MUST tear down its UI before invoking tmux, identical to how plain Enter / Alt+Enter / Ctrl+F spawn `claude` directly.

#### Scenario: Ctrl+W in tmux opens a new window with the resumed session

- **WHEN** the user is inside tmux, has the picker open on a row with project path `/home/u/alpha`, and presses Ctrl+W
- **THEN** `tmux new-window -n <window-name> -c /home/u/alpha "claude --resume <session-id>"` is executed
- **AND** the picker exits cleanly with the tmux exit code

#### Scenario: Saved name flows into both window-name and --name

- **WHEN** the row has a saved name `"auth rewrite"` in `sessions.json.names`
- **THEN** the tmux window-name is `"auth rewrite"` (truncated to 40 chars if longer)
- **AND** the inner command passed to tmux is `claude --name "auth rewrite" --resume <session-id>`

### Requirement: Window-name resolution falls back through saved-name → project-name → basename → "claude"

The window name SHALL resolve in priority order: (1) saved name from `sessions.json.names[<id>]` if non-empty; (2) the row's `projectName` field if non-empty; (3) `path.basename(projectPath)` if `projectPath` is set; (4) the literal `"claude"` as a final fallback. The resolved name MUST be (a) stripped of control characters and (b) truncated to 40 visible characters with a trailing `…` if longer.

#### Scenario: No saved name → projectName used

- **WHEN** the row has no saved name but has `projectName === "alpha"`
- **THEN** the tmux window-name is `"alpha"`

#### Scenario: No projectName → basename(projectPath) used

- **WHEN** the row has no saved name, no `projectName`, and `projectPath === "/home/u/foo-bar"`
- **THEN** the tmux window-name is `"foo-bar"`

#### Scenario: Long names truncated with ellipsis

- **WHEN** the resolved name is longer than 40 visible characters
- **THEN** the tmux window-name is the first 39 characters followed by `…`

#### Scenario: Control characters stripped

- **WHEN** the saved name contains a control character (e.g., `"my\x07chat"`)
- **THEN** the tmux window-name is `"mychat"` (control chars removed before being passed to tmux)

### Requirement: Outside tmux Ctrl+W is a no-op with a clear message

When `$TMUX` is not set in the environment (or `--no-tmux` is passed), the Ctrl+W binding MUST NOT invoke tmux. The picker SHOULD also omit the Ctrl+W entry from its status / help line in this state, so users don't see a binding that's inert.

#### Scenario: No $TMUX → Ctrl+W shows a message and keeps picker open

- **WHEN** `$TMUX` is unset and the user presses Ctrl+W
- **THEN** a one-line message is printed to stderr noting that Ctrl+W requires being inside tmux
- **AND** the picker remains open and the cursor remains on the selected row

#### Scenario: --no-tmux disables the binding even inside tmux

- **WHEN** `$TMUX` is set, the user passes `--no-tmux`, and presses Ctrl+W
- **THEN** the picker behaves as if `$TMUX` were unset (no-op with stderr message)

#### Scenario: Status / help line omits Ctrl+W outside tmux

- **WHEN** `$TMUX` is unset or `--no-tmux` is passed
- **THEN** the picker's status / help line does NOT include a Ctrl+W entry

### Requirement: `--no-tmux` is documented in `--help`

The `--no-tmux` flag SHALL appear in `multivac --help` with a description of its purpose (escape hatch for environments where `tmux new-window` is broken or undesirable).

#### Scenario: --no-tmux entry in help

- **WHEN** the user runs `multivac --help`
- **THEN** the output contains an entry for `--no-tmux` with a non-empty description

