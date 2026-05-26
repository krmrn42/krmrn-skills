# multivac-dangerous-resume Specification

## Purpose
TBD - created by archiving change dangerous-resume-keybinding. Update Purpose after archive.
## Requirements
### Requirement: CLI flag arms the dangerous-resume capability

`multivac` SHALL accept a new boolean flag `--dangerously-skip-permissions` (no short form). When the flag is present in `argv`, the picker MUST arm the dangerous-resume keybinding and update the picker's help line to reflect it. When the flag is absent, the picker's behavior MUST be byte-for-byte identical to the pre-change behavior.

#### Scenario: Flag accepted by parser

- **WHEN** the user runs `multivac --dangerously-skip-permissions` on any platform
- **THEN** the process does not error out at parse time
- **AND** `args.dangerouslySkipPermissions` is `true` inside the parsed args record

#### Scenario: Flag default is false

- **WHEN** the user runs `multivac` without the flag
- **THEN** `args.dangerouslySkipPermissions === false`
- **AND** the picker's help line does NOT show the "Alt-Enter dangerous" entry
- **AND** Alt+Enter inside the picker falls through to normal Enter behavior (still resumes the selected row with plain `claude --resume`)

#### Scenario: Flag has no effect on one-shot mode

- **WHEN** the user runs `multivac --dangerously-skip-permissions --list "foo"` (one-shot via the `interactive-by-default` change's opt-out, or with stdout piped)
- **THEN** the printed `resumeOneLiner` lines do NOT contain `--dangerously-skip-permissions`
- **AND** the process exits exactly as it would without the flag (the flag is silently ignored in one-shot mode, on purpose — see design.md §Decision 4)

### Requirement: Alt+Enter triggers dangerous resume when armed

When the dangerous-resume capability is armed (CLI flag set) and the picker is active, pressing Alt+Enter on a selected row SHALL spawn `claude` with `--dangerously-skip-permissions` prepended to the existing `--resume <sessionId>` argv, in the same cwd-resolution logic the plain Enter path uses.

Node readline raw-mode reports Alt+Enter as a keypress event with `{ name: "return", meta: true }`. The picker MUST check `key.meta && key.name === "return"` before the plain-`return` branch in its keypress handler so the dangerous binding takes precedence.

#### Scenario: Alt+Enter on a row spawns claude with the flag

- **WHEN** the user has armed the capability and presses Alt+Enter on a selected row in the picker
- **THEN** `claude` is spawned with argv equal to `["--dangerously-skip-permissions", "--resume", "<sessionId>"]`
- **AND** the spawn cwd is the row's `projectPath` if it exists as a directory; otherwise the user's current cwd with the existing warning printed to stderr (identical fallback logic to plain Enter)
- **AND** the picker exits with the child process's exit code (identical exit-code propagation to plain Enter)

#### Scenario: Alt+Enter on no row is a safe no-op

- **WHEN** the user presses Alt+Enter when the result list is empty (e.g., bad query, fresh empty index)
- **THEN** the picker remains open
- **AND** no `claude` process is spawned

#### Scenario: Plain Enter still resumes normally when the flag is armed

- **WHEN** the user has armed the capability and presses plain Enter (without Alt) on a row
- **THEN** `claude` is spawned with argv equal to `["--resume", "<sessionId>"]` — no `--dangerously-skip-permissions` is added
- **AND** plain Enter's behavior is exactly what it would be without the flag

### Requirement: Shift+Enter is a best-effort secondary binding

The picker SHALL also wire Shift+Enter to the dangerous-resume action when the terminal reports it distinguishably from Enter. Node readline reports Shift+Enter as `{ name: "return", shift: true }` on terminals that support CSI-u or kitty keyboard protocol; on terminals that send `\r` for both Enter and Shift+Enter, the picker MUST NOT misinterpret a plain Enter as Shift+Enter. The condition `(key.meta || key.shift) && key.name === "return"` is acceptable because `key.shift` is `false` for plain Enter on terminals that don't send the distinguishing sequence.

#### Scenario: Shift+Enter on a CSI-u terminal triggers dangerous resume

- **WHEN** the user is on a terminal that reports Shift+Enter as a distinct event (Kitty, WezTerm, iTerm2 with CSI-u, Windows Terminal w/ enhanced kb) and presses Shift+Enter with the flag armed
- **THEN** the same `claude` spawn happens as with Alt+Enter (`["--dangerously-skip-permissions", "--resume", "<sessionId>"]`)

#### Scenario: Plain Enter on a non-CSI-u terminal stays safe

- **WHEN** the user is on a terminal that sends `\r` for both Enter and Shift+Enter (xterm, GNOME Terminal, default macOS Terminal.app, tmux without passthrough) and presses Enter — the user might believe they pressed Shift+Enter
- **THEN** `claude` is spawned with `["--resume", "<sessionId>"]` (plain resume), NOT with `--dangerously-skip-permissions`
- **AND** no `--dangerously-skip-permissions` is silently injected

### Requirement: Armed state is visible in the picker

When the dangerous-resume capability is armed, the picker's status bar SHALL include an entry for the Alt-Enter / Shift-Enter binding rendered in yellow (using the existing `ansi.fgYellow` style). When the capability is not armed, the entry MUST NOT appear in the status bar. This requirement is now satisfied via the BINDINGS table's `visible: (deps) => !!deps.dangerouslySkipPermissions` predicate and the `category: "dangerous"` yellow styling, rather than via an inline yellow string in `render`.

#### Scenario: Status bar shows yellow danger entry when armed

- **WHEN** the picker is open and `args.dangerouslySkipPermissions === true`
- **THEN** the status bar includes an "Alt-Enter dangerous" entry (also showing Shift-Enter as a fallback key spelling) in yellow

#### Scenario: Status bar omits danger entry when not armed

- **WHEN** the picker is open and `args.dangerouslySkipPermissions === false`
- **THEN** the status bar does NOT include any Alt-Enter / Shift-Enter entry

### Requirement: `--help` documents the flag

`multivac --help` SHALL include an entry for `--dangerously-skip-permissions` describing what it does (arms the picker keybinding to add `--dangerously-skip-permissions` to the `claude` spawn) and stating that the flag has no effect on one-shot text output. The entry MUST also note that Shift+Enter is a best-effort binding (terminal-dependent) and Alt+Enter is the reliable one.

#### Scenario: --help describes the flag

- **WHEN** the user runs `multivac --help`
- **THEN** the output contains a section or line for `--dangerously-skip-permissions`
- **AND** the description names Alt+Enter as the bound key, mentions Shift+Enter as terminal-dependent, and states the flag is picker-only

