# ccsearch-default-mode Specification

## Purpose
TBD - created by archiving change interactive-by-default. Update Purpose after archive.
## Requirements
### Requirement: TUI is the default surface on an interactive TTY

When invoked on a terminal where both stdin and stdout are TTYs, and no opt-out flag is present (see next requirement), `ccsearch` SHALL open the built-in TUI picker. This holds with or without a positional query: a bare `ccsearch` MUST open the picker with an empty query (no longer the historic "no query provided" error), and `ccsearch "foo"` MUST open the picker pre-populated with `foo`.

#### Scenario: Bare invocation on TTY opens picker

- **WHEN** the user runs `ccsearch` with stdin and stdout both attached to a terminal, no flags
- **THEN** the TUI picker opens with an empty query field
- **AND** the picker behaves identically to today's `ccsearch -i` (no query)
- **AND** the process does NOT emit the previous `"no query provided"` error

#### Scenario: Query-only invocation on TTY opens picker

- **WHEN** the user runs `ccsearch "session timeout"` on an interactive TTY
- **THEN** the TUI picker opens with `session timeout` pre-filled as the active query
- **AND** results are shown ranked by relevance

### Requirement: Opt-out flags keep one-shot mode on a TTY

The following flags, when present, SHALL cause `ccsearch` to dispatch to one-shot rendering (the pre-change default) even on an interactive TTY: `--list` / `-l`, `--format=text`, `--format=tsv`, `--regex` (with or without `--scan`), `--preview SESSION_ID`, `--reindex`, `--index-status`.

In addition, when stdin or stdout is NOT a TTY, `ccsearch` MUST dispatch to one-shot rendering regardless of whether any opt-out flag is present.

#### Scenario: --list forces one-shot on a TTY

- **WHEN** the user runs `ccsearch --list "foo"` on an interactive TTY
- **THEN** the process prints the same text output that `ccsearch "foo"` produced before this change
- **AND** the TUI does NOT open

#### Scenario: --format=text forces one-shot on a TTY

- **WHEN** the user runs `ccsearch --format=text "foo"` on an interactive TTY
- **THEN** the process prints text output (same rows the picker would have shown, in the existing one-shot format)
- **AND** the TUI does NOT open

#### Scenario: --regex forces one-shot on a TTY

- **WHEN** the user runs `ccsearch --regex 'TOKEN_[A-F0-9]{8}' --scan` on an interactive TTY (no positional query)
- **THEN** the process runs the regex full-scan and prints text output
- **AND** the TUI does NOT open

#### Scenario: --preview forces one-shot on a TTY

- **WHEN** the user runs `ccsearch --preview <session-id>` on an interactive TTY
- **THEN** the process renders the preview text and exits
- **AND** the TUI does NOT open

#### Scenario: --reindex and --index-status force one-shot

- **WHEN** the user runs `ccsearch --reindex` or `ccsearch --index-status` on an interactive TTY
- **THEN** the process executes the indexer/status branch and exits with stdout output
- **AND** the TUI does NOT open

#### Scenario: Piped stdout forces one-shot

- **WHEN** the user runs `ccsearch "foo" | head` (stdout is a pipe)
- **THEN** the process renders `tsv` output (today's behavior) and exits
- **AND** the TUI does NOT open
- **AND** no TTY-required error is raised

#### Scenario: Redirected stdout forces one-shot

- **WHEN** the user runs `ccsearch "foo" > out.txt`
- **THEN** the process renders `tsv` and exits cleanly
- **AND** the TUI does NOT open

#### Scenario: Non-TTY stdin forces one-shot

- **WHEN** the user runs `echo "" | ccsearch "foo"` (stdin is a pipe even though stdout is a TTY)
- **THEN** the process renders `text` output and exits
- **AND** the TUI does NOT open (the picker requires raw-mode stdin)

### Requirement: `-i` / `--interactive` remains a valid explicit selector

The `-i` and `--interactive` flags SHALL continue to be accepted by the parser. When present they MUST select the TUI picker, identical to today's behavior. They take precedence over opt-out flag inference, EXCEPT they cannot override a non-TTY environment: `ccsearch -i` with non-TTY stdin or stdout MUST fail with the existing `EXIT_ENV` ("requires a TTY") error rather than silently falling back to one-shot.

#### Scenario: -i still opens the picker on a TTY

- **WHEN** the user runs `ccsearch -i "foo"` on an interactive TTY
- **THEN** the TUI picker opens with `foo` pre-filled, exactly as before this change

#### Scenario: -i with --list errors clearly

- **WHEN** the user runs `ccsearch -i --list "foo"`
- **THEN** the process exits with `EXIT_USER` (`1`) and a message stating that `-i` and `--list` are mutually exclusive
- **AND** the TUI does NOT open

#### Scenario: -i without TTY still errors

- **WHEN** the user runs `ccsearch -i "foo" | cat` (stdout piped)
- **THEN** the process exits with `EXIT_ENV` (`2`) and the existing "requires a TTY" message
- **AND** the TUI does NOT open

### Requirement: Help and flag entries reflect the new defaults

The output of `ccsearch --help` SHALL reflect that the TUI is the default and that `--list`/`--format`/`--regex`/special-modes opt out of it. Specifically: the `-i` / `--interactive` entry MUST note that it is the default on a TTY; a `--list` / `-l` entry MUST be present and describe it as "force one-shot ranked text output (the pre-change default)"; the usage synopsis MUST show that the positional `[query]` is optional. (Coordinated with the `improve-ccsearch-help` change, which lands the structured help format these entries live in.)

#### Scenario: --help mentions TUI default

- **WHEN** the user runs `ccsearch --help`
- **THEN** the output mentions, in either the description block or the `-i` entry, that the TUI is the default on a TTY

#### Scenario: --help documents --list

- **WHEN** the user runs `ccsearch --help`
- **THEN** the output contains an entry for `--list` (or `-l`) with a one-line description of the opt-out semantics

### Requirement: Slash command behavior is unchanged

The slash command `/chat-search:find` invokes `ccsearch --format=text --no-color --limit=10`. Because `--format` is set, this falls into the one-shot opt-out branch by the rules above. The slash command's documented behavior MUST be unchanged after this change.

#### Scenario: /chat-search:find still renders inline text

- **WHEN** the slash command runs in a Claude Code session and invokes `ccsearch --format=text --no-color --limit=10 "foo"`
- **THEN** the process renders inline text (the rendered top-10 list as today)
- **AND** the TUI does NOT open
- **AND** no `EXIT_ENV` "requires a TTY" error is raised even in environments where stdin/stdout are not raw-mode-capable TTYs

