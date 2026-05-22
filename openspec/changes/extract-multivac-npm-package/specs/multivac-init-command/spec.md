## ADDED Requirements

### Requirement: `init` subcommand installs the marketplace plugin

The CLI SHALL accept `init` as a positional subcommand (i.e., `multivac init` or `npx @krmrn42/multivac init`). When invoked, the subcommand SHALL drive Claude Code's plugin install for the `chat-search` plugin from the `krmrn42/krmrn-skills` marketplace using the user's existing Claude Code installation.

#### Scenario: init runs the canonical install sequence

- **WHEN** a user runs `multivac init` with the `claude` CLI on `$PATH`
- **THEN** the subcommand executes (or asks Claude Code to execute) the equivalent of `/plugin marketplace add krmrn42/krmrn-skills` followed by `/plugin install chat-search@krmrn-skills`
- **AND** stdout reports both steps with a clear success/failure indicator per step

#### Scenario: init does not conflict with bare CLI usage

- **WHEN** a user runs `multivac` with no subcommand and no positional argument
- **THEN** the CLI invokes the default behavior of the prior `ccsearch` entrypoint (TUI picker on a TTY, help on a non-TTY pipe — per existing behavior)
- **AND** `init` as a positional subcommand is recognized only when it is the first non-flag argument

#### Scenario: init reserves the name from search query collision

- **WHEN** a user genuinely wants to search for the literal token `init`
- **THEN** they can use the escape form `multivac -- init` or `multivac --query init` (whichever form the implementation chooses — see design.md)
- **AND** `multivac --help` documents that `init` is a reserved subcommand and shows how to search for the literal token

### Requirement: Claude Code detection and fallback

When the `claude` CLI is not present on `$PATH`, or the user is in an environment where Claude Code cannot be driven non-interactively, `init` SHALL print the exact two slash commands the user needs to paste into a Claude Code session and exit with code 0 (informational) rather than failing.

#### Scenario: claude CLI absent

- **WHEN** a user runs `multivac init` on a machine where `command -v claude` returns nothing
- **THEN** stdout contains a clearly-labeled section titled "Manual install" (or equivalent)
- **AND** the section prints the two literal slash commands on their own lines: `/plugin marketplace add krmrn42/krmrn-skills` and `/plugin install chat-search@krmrn-skills`
- **AND** the exit code is 0

#### Scenario: Detection check is documented in help

- **WHEN** a user runs `multivac init --help`
- **THEN** the help text states that `init` detects Claude Code via `$PATH` and falls back to manual instructions when absent

### Requirement: Idempotent re-invocation

`multivac init` SHALL be safe to re-run. Re-invocation MUST NOT produce destructive side effects (e.g., duplicate marketplace entries, downgraded plugins, edited dotfiles).

#### Scenario: Re-run on an already-configured machine

- **WHEN** a user runs `multivac init` a second time, with the marketplace already added and the plugin already installed
- **THEN** the subcommand reports each step as "already configured" rather than erroring
- **AND** the exit code is 0
- **AND** no marketplace entry, plugin version, or local file is mutated

### Requirement: No silent dotfile modification

`multivac init` SHALL NOT modify shell-rc files (`~/.zshrc`, `~/.bashrc`, fish config, etc.) without explicit user consent. If `init` determines a `$PATH` export would help the user (e.g., for the npm-global `bin` directory), it MUST print the recommended export line and instruct the user to add it themselves, mirroring the existing `/chat-search:setup` slash command's policy.

#### Scenario: PATH export is suggested, never written

- **WHEN** `multivac init` runs in an environment where the npm-global bin directory is not on `$PATH`
- **THEN** stdout prints the appropriate shell-rc export line for the user's detected shell (zsh / bash / fish)
- **AND** no shell-rc file is read or written by `multivac init` itself

#### Scenario: No write under ~/.claude/ beyond what Claude Code's own install does

- **WHEN** `multivac init` runs
- **THEN** the only writes to `~/.claude/` are those performed by the `claude` CLI itself in response to the `/plugin install` invocation (i.e., `multivac` does not edit `~/.claude.json` directly)

### Requirement: Exit codes mirror the rest of the CLI

`multivac init` SHALL use the existing exit-code convention defined by the `ccsearch` CLI: 0 success, 1 user error (e.g., unknown flag), 2 environment error (e.g., a required tool failed in a way the user can fix), 3 internal error.

#### Scenario: Bad flag returns 1

- **WHEN** a user runs `multivac init --no-such-flag`
- **THEN** the exit code is 1
- **AND** stderr names the unknown flag

#### Scenario: Plugin install failure returns 2

- **WHEN** `multivac init` invokes `claude /plugin install` and the underlying call exits non-zero
- **THEN** `multivac init` exits with code 2
- **AND** stderr contains the underlying `claude` CLI's error output verbatim
