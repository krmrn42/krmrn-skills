## ADDED Requirements

### Requirement: Help output describes every accepted argument

The `ccsearch` CLI SHALL, when invoked with `-h` or `--help`, print a help text that names and describes every positional argument and every long-form option recognized by its argument parser. Each option entry MUST include the long flag, the short flag (if any), the value placeholder (e.g., `PAT`, `N`, `YYYY-MM-DD`, `SESSION_ID`, `PATH`) when the option takes a value, a one-sentence description of its effect, and — where applicable — the default value.

The set of options that MUST appear in help is exactly the set the parser accepts: `-h`/`--help`, `-i`/`--interactive`, `--regex PAT`, `--scan`, `--include-tools`, `--only-user`, `--project SUBSTR`, `--since YYYY-MM-DD`, `--limit N`, `--format text|tsv`, `--db-path PATH`, `--preview SESSION_ID`, `--no-color`, `--reindex`, `--index-status`.

#### Scenario: Every accepted flag appears in help

- **WHEN** a user runs `ccsearch --help`
- **THEN** stdout contains a section listing each long-form flag accepted by the parser, with at minimum the flag spelling and a non-empty description on the same line or in the immediately following indented lines

#### Scenario: Previously hidden flags become discoverable

- **WHEN** a user runs `ccsearch --help`
- **THEN** the output mentions `--reindex`, `--index-status`, `--preview`, `--no-color`, and `--db-path` with their meanings (each of these is accepted by the current parser but absent from the pre-change help text)

#### Scenario: Defaults are stated for options that have them

- **WHEN** a user reads the help entry for `--limit`
- **THEN** the entry indicates the default value (`20`)
- **AND** the help entry for `--format` indicates the default behavior (`text` on a TTY, `tsv` when stdout is a pipe)
- **AND** the help entry for `--db-path` indicates the default location resolution (the plugin-owned index under `$XDG_DATA_HOME/krmrn42-skills/chat-search/`)

### Requirement: Help output is structured

The help text SHALL be organized into discrete, labeled sections in the following order: (1) `usage:` synopsis line(s), (2) a one-line description of the tool, (3) `Positional arguments:` block, (4) one or more `Options:` blocks (options MAY be grouped, e.g., filters vs. output vs. index management), (5) `Examples:` block, (6) trailing notes (TSV columns, runtime requirement, exit codes).

#### Scenario: Sections are labeled and ordered

- **WHEN** a user runs `ccsearch --help`
- **THEN** the output contains the literal headers `usage:`, `Positional arguments:`, at least one `Options:` header, and `Examples:` in that order

#### Scenario: Exit codes are documented in the help

- **WHEN** a user runs `ccsearch --help`
- **THEN** the output describes the meaning of exit codes `0`, `1`, `2`, and `3` (matching the values defined at the top of `bin/ccsearch`)

### Requirement: Constraints between flags are surfaced

The help SHALL describe constraints that the parser enforces at runtime, so users see them before they get an error: `--only-user` and `--include-tools` are mutually exclusive; using `--regex` without a positional query requires `--scan`; `--format` accepts only `text` or `tsv`; `--since` accepts only `YYYY-MM-DD`; `--limit` requires a positive integer.

#### Scenario: Mutually exclusive filters are flagged

- **WHEN** a user reads the help entries for `--only-user` and `--include-tools`
- **THEN** at least one of them notes that the two cannot be combined, or the synopsis shows them in a `[--include-tools | --only-user]` alternation group

#### Scenario: Regex-without-query constraint is stated

- **WHEN** a user reads the help entry for `--regex` or `--scan`
- **THEN** the help indicates that `--regex` without a positional query requires `--scan`

### Requirement: Help exits successfully and writes to stdout

`ccsearch -h` and `ccsearch --help` SHALL each write the help text to stdout (not stderr) and exit with status `0`, regardless of whether other flags or a positional query are present on the command line.

#### Scenario: --help exits 0 on stdout

- **WHEN** a user runs `ccsearch --help`
- **THEN** the process exits with status `0`
- **AND** the help text is written to stdout
- **AND** stderr is empty

#### Scenario: -h short form behaves identically

- **WHEN** a user runs `ccsearch -h`
- **THEN** the output and exit status match `ccsearch --help` byte-for-byte

#### Scenario: --help overrides other flags

- **WHEN** a user runs `ccsearch --help --regex 'foo' --limit 5`
- **THEN** the process prints help and exits `0` without attempting to open the index or run a query

### Requirement: Help and parser do not drift

The `ccsearch` test suite SHALL include a check that fails if the help text omits any long-form flag accepted by the parser, so future flag additions cannot be merged without updating the help.

#### Scenario: Test catches an unhelp-ed flag

- **WHEN** a contributor adds a new `case "--new-flag":` branch to `parseArgs` without updating `buildHelp`
- **THEN** running `bash plugins/chat-search/bin/ccsearch.test.sh` exits non-zero with a message naming the flag(s) missing from help

#### Scenario: Test passes on the current set

- **WHEN** the test runs against the change-as-shipped (`buildHelp` covers every parser flag)
- **THEN** the test exits `0`
