# ccsearch-session-rename Specification

## Purpose
TBD - created by archiving change picker-rename-session. Update Purpose after archive.
## Requirements
### Requirement: Ctrl+R enters a rename-input mode for the selected row

When the picker is in browse mode and a row is selected, pressing **Ctrl+R** SHALL switch the picker into a rename-input mode. The rename prompt MUST pre-fill with the row's current saved name if one exists, otherwise with the row's current title text. Esc cancels the rename without writing; Enter commits the rename (writing to `sessions.json`); Ctrl+C exits the picker entirely (consistent with browse mode).

#### Scenario: Ctrl+R opens rename mode on the selected row

- **WHEN** the user has the picker open on a row and presses Ctrl+R
- **THEN** the top line of the picker changes to a rename prompt (e.g., `rename> <prefilled-text>`)
- **AND** typing characters extends the rename buffer, Backspace removes the last character, Ctrl+U clears the buffer
- **AND** Ctrl+R while already in rename mode is a no-op

#### Scenario: Esc cancels rename without modifying the saved state

- **WHEN** the user is in rename mode and presses Esc
- **THEN** the picker returns to browse mode
- **AND** `sessions.json` is not written
- **AND** the previously selected row remains selected and its display is unchanged

#### Scenario: Enter commits rename and updates display

- **WHEN** the user is in rename mode, has typed a non-empty name, and presses Enter
- **THEN** the name is written to `sessions.json` under `names[<session-id>]`
- **AND** the picker returns to browse mode with the row's line 1 now leading with the new name
- **AND** the row remains selected

#### Scenario: Empty buffer + Enter clears the saved name

- **WHEN** the user is in rename mode, the buffer is empty (after Backspace or Ctrl+U), and presses Enter
- **THEN** any existing entry for the row's session id is removed from `sessions.json`
- **AND** the row's line 1 reverts to the synthesized title (or metadata-only if no usable title can be synthesized)

### Requirement: Saved names persist to a JSON config file

The picker SHALL persist names to `$XDG_CONFIG_HOME/krmrn42-skills/chat-search/sessions.json` (falling back to `~/.config/krmrn42-skills/chat-search/sessions.json` when `XDG_CONFIG_HOME` is unset). Writes MUST be atomic via the write-to-tmp + rename pattern so a crash mid-write cannot corrupt the previous file. The file MUST be valid JSON with the shape `{ "version": 1, "names": { "<session-id>": "<name>" }, "pins": [...] }`. If the file does not exist on read, an empty object is the implicit value.

#### Scenario: First rename creates the file and the parent directory

- **WHEN** the user renames a session for the first time and the config directory does not exist
- **THEN** the picker creates the directory tree (with `recursive: true`)
- **AND** writes a valid `sessions.json` containing exactly the new entry under `names`

#### Scenario: Atomic write leaves no .tmp debris on success

- **WHEN** the picker writes `sessions.json` and the write succeeds
- **THEN** the final file exists at the canonical path
- **AND** no `sessions.json.tmp` file is left behind

#### Scenario: Corrupt JSON is tolerated as empty

- **WHEN** the picker starts and `sessions.json` exists but is not valid JSON
- **THEN** the picker treats it as an empty config (no saved names)
- **AND** a warning is printed to stderr naming the file (so the user can investigate)
- **AND** subsequent writes overwrite the corrupt file with valid JSON

### Requirement: Saved names propagate to all `claude` resume actions

Whenever the picker spawns `claude` for a row that has a saved name in `sessions.json`, the spawn argv SHALL include `--name <saved-name>`. This applies to: plain Enter (resume), Alt+Enter (dangerous resume), Ctrl+F (fork), and the future remote-control / tmux-new-window actions.

#### Scenario: Plain Enter passes --name when set

- **WHEN** the user has assigned a name to a session and presses Enter on that row
- **THEN** the spawned `claude` argv is `["--name", "<name>", "--resume", "<session-id>"]`

#### Scenario: Alt+Enter (dangerous resume) passes --name when set

- **WHEN** the user has assigned a name AND `--dangerously-skip-permissions` is armed AND presses Alt+Enter
- **THEN** the spawned `claude` argv is `["--dangerously-skip-permissions", "--name", "<name>", "--resume", "<session-id>"]`

#### Scenario: No --name when no saved name

- **WHEN** the user presses Enter on a row with no saved name
- **THEN** the spawned `claude` argv does NOT include `--name` (existing behavior preserved)

### Requirement: `--print-names` reads the config file to stdout

`ccsearch --print-names` SHALL print the contents of `sessions.json` to stdout (as valid JSON) and exit `0`. If the file does not exist, prints `{}` and exits `0`. The flag MUST NOT write to the file or perform any other side effect.

#### Scenario: Prints the file contents

- **WHEN** the user runs `ccsearch --print-names` and `sessions.json` contains `{"version":1,"names":{"abc":"my chat"}}`
- **THEN** stdout receives that exact JSON (whitespace normalization allowed)
- **AND** exit code is `0`

#### Scenario: Missing file → empty object

- **WHEN** the user runs `ccsearch --print-names` and `sessions.json` does not exist
- **THEN** stdout receives `{}` (a valid empty JSON object)
- **AND** exit code is `0`

