# multivac-remote-control-resume Specification

## Purpose
TBD - created by archiving change picker-remote-control-launch. Update Purpose after archive.
## Requirements
### Requirement: Ctrl+T spawns claude with `--remote-control`

When the picker is in browse mode and a row is selected, pressing **Ctrl+T** SHALL spawn `claude` with the `--remote-control` flag and `--resume <session-id>`, in the row's project directory (with the same cwd-resolution fallback the plain Enter path uses). The picker MUST tear down its UI before the spawn, identical to plain Enter / Alt+Enter / Ctrl+F.

#### Scenario: Ctrl+T without saved name

- **WHEN** the user presses Ctrl+T on a row that has no saved name in `sessions.json`
- **THEN** the spawned `claude` argv is `["--remote-control", "--resume", "<session-id>"]`
- **AND** the spawn cwd is the row's `projectPath` (or the user's current cwd with the existing fallback warning if `projectPath` is missing)

#### Scenario: Ctrl+T with saved name passes name to remote-control

- **WHEN** the user presses Ctrl+T on a row whose session id has a saved name in `sessions.json.names`
- **THEN** the spawned `claude` argv is `["--remote-control", "<name>", "--resume", "<session-id>"]`
- **AND** the argv does NOT additionally include `--name <name>` (the remote-control flag consumes the name semantically)

### Requirement: Ctrl+T is always available (no opt-in flag)

The Ctrl+T binding SHALL be active whenever the picker is open, with no CLI flag required to arm it. The picker's status / help line MUST list Ctrl+T regardless of whether other capabilities (dangerous resume, tmux, etc.) are armed.

#### Scenario: Ctrl+T works on bare multivac invocation

- **WHEN** the user runs `multivac` and presses Ctrl+T on a row
- **THEN** the remote-control spawn happens (subject to TTY / cwd-resolution rules)

#### Scenario: Help line mentions Ctrl+T

- **WHEN** the picker is open
- **THEN** the help / status line includes a Ctrl+T entry described as "remote control" (the exact wording is the status-bar capability's call; this requirement only mandates that the entry is present)

### Requirement: Ctrl+T uses the same cwd resolution and exit-code propagation as plain Enter

The spawn SHALL use `cwd = projectPath if isExistingDir(projectPath) else process.cwd()`, with the existing stderr warning when the fallback occurs. The picker SHALL exit with the child process's exit code, identical to plain Enter / Alt+Enter / Ctrl+F.

#### Scenario: Missing project path falls back to cwd

- **WHEN** the row's `projectPath` is empty or does not exist as a directory
- **THEN** the spawn cwd is `process.cwd()`
- **AND** stderr receives the same `"resuming in current cwd. claude --resume may fail"` warning that plain Enter produces

#### Scenario: Spawn failure surfaces as picker exit

- **WHEN** the spawned `claude` exits with code `N`
- **THEN** the picker exits with code `N` (existing behavior, unchanged)

