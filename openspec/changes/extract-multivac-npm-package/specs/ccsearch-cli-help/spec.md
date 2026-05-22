## MODIFIED Requirements

### Requirement: Help output is structured

The help text SHALL be organized into discrete, labeled sections in the following order: (1) `usage:` synopsis line(s), (2) a one-line description of the tool, (3) `Positional arguments:` block, (4) one or more `Options:` blocks (options MAY be grouped, e.g., filters vs. output vs. index management), (5) `Examples:` block, (6) trailing notes (TSV columns, runtime requirement, exit codes).

The program-name token in the `usage:` synopsis line(s) and in every example invocation within the help text SHALL be the literal string `multivac`. The historical literal `ccsearch` MUST NOT appear in any synopsis line, example, or section header of the help output. (A bin-aware/sanitized program-name approach was considered and rejected — see `design.md` D4 — because the package ships a single bin name and a literal hardcode is simpler.)

#### Scenario: Sections are labeled and ordered

- **WHEN** a user runs `multivac --help`
- **THEN** the output contains the literal headers `usage:`, `Positional arguments:`, at least one `Options:` header, and `Examples:` in that order

#### Scenario: Exit codes are documented in the help

- **WHEN** a user runs `multivac --help`
- **THEN** the output describes the meaning of exit codes `0`, `1`, `2`, and `3` (matching the values defined at the top of `src/multivac.js`)

#### Scenario: Program name in synopsis is `multivac`

- **WHEN** a user runs `multivac --help`
- **THEN** the `usage:` synopsis line begins with the literal token `multivac`
- **AND** every example invocation in the `Examples:` block begins with `multivac` (not `ccsearch`)

#### Scenario: Historical `ccsearch` literal is absent

- **WHEN** a user runs `multivac --help` and pipes the output through `grep -i ccsearch`
- **THEN** the result is empty (the only place the historical name MAY appear in the repo's docs is the `NAMING.md` decision record and a CHANGELOG line — neither of which are part of `--help` output)
