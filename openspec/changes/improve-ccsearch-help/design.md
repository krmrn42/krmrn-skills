## Context

`ccsearch` is a single-file Node.js CLI (no dependencies, no build step) shipped under `plugins/chat-search/bin/`. Its argument parser is a hand-written `switch`/`case` over the option list — there is no library mediating between the flag list and the help text. The current `buildHelp()` (`bin/ccsearch` §556-580) was authored as a quick synopsis-plus-examples and has not kept up with flag additions: `--reindex`, `--index-status`, `--preview`, `--no-color`, and `--db-path` are all accepted by `parseArgs` but missing from help.

Since the rest of the file is plain-Node, we keep the same posture: rebuild help inside `buildHelp()` from a single in-file table of option metadata. No new dependencies, no codegen, no external schema. The README's options table (`plugins/chat-search/README.md` §"Flag reference") is the human-edited canonical reference for flag semantics; the new help reuses its wording so the two stay aligned by convention. A test asserts the parser-vs-help drift cannot reappear silently.

## Goals / Non-Goals

**Goals:**

- `ccsearch --help` (and `-h`) prints a complete, structured help block: synopsis, positional args, grouped options with descriptions and defaults, examples, notes (TSV columns, exit codes, runtime).
- Every long-form flag accepted by `parseArgs` is named in the help.
- Constraints currently enforced only at runtime (`--only-user` ⊕ `--include-tools`, `--regex` w/o query requires `--scan`, etc.) appear in the help so users learn them before tripping over them.
- `ccsearch.test.sh` gains an assertion that fails if the parser and help diverge.
- Zero new dependencies; ccsearch remains a single Node file.

**Non-Goals:**

- No changes to flag names, semantics, defaults, parsing logic, or output formats. This is purely a `--help` rewrite plus a drift guard.
- No new documentation files. The README options table is not modified.
- No localization, terminal-width adaptation, or colorized help.
- No move to a CLI-parsing library (`commander`, `yargs`, `meow`). The zero-deps invariant is intentional — keeping it.
- No generation of help from a shared schema file. We could derive both `parseArgs` and help from a single table; that is a tempting refactor but is out of scope here. The drift guard in tests is the cheaper substitute.

## Decisions

### Decision 1: Single in-file option table, consumed only by `buildHelp`

`buildHelp` builds its option block from a local `const OPTIONS = [...]` array of `{ flags, placeholder, group, description, default }` records. `parseArgs` is unchanged — it keeps its hand-written `switch`.

**Why not derive `parseArgs` from the same table?** It would eliminate the drift class entirely, but it requires reshaping the parser, introduces a tiny dispatch layer, and risks regressing the parser's hand-tuned error messages. The drift guard in tests catches the same bug for a fraction of the code change. If a third place ever needs the option list (e.g., shell completions), we revisit.

**Alternative considered: keep the README table as the only source and have `--help` print "see README".** Rejected — defeats the purpose. Users invoke `--help` precisely when they don't want to leave the terminal.

### Decision 2: Help layout follows argparse conventions

Order: `usage:` synopsis → one-line description → `Positional arguments:` → grouped `Options:` blocks → `Examples:` → `Notes:` (TSV columns, exit codes, runtime). Option entries are formatted as:

```
  -i, --interactive          Open the built-in TUI picker.
  --regex PAT                Post-filter results with this regex (Node RegExp,
                             m flag). Without a positional query, requires --scan.
  --limit N                  Max conversations returned. Default: 20.
```

Indent 2 spaces, flag column ~28 chars, then description; wrap continuation lines at the same indent. This matches what Python's `argparse` produces and what users expect from Unix CLIs.

**Why grouped options?** Filters (`--regex`, `--project`, `--since`, `--include-tools`, `--only-user`), output (`--format`, `--limit`, `--no-color`), and index management (`--db-path`, `--reindex`, `--index-status`) are conceptually distinct. Grouping makes the help scannable; flat alphabetical was the alternative but obscures that `--reindex` and `--index-status` are not search flags.

### Decision 3: Drift guard lives in `ccsearch.test.sh`, parses the source

The new test block extracts the set of long-form flags from `parseArgs` (lines matching `case "--…":`) and the set from `buildHelp` output (`ccsearch --help | grep -oE -- '--[a-z][a-z-]+'`), diffs them, and fails with a clear message if they differ. The check runs inside the existing fixture-DB harness so we don't add a second test entry point.

**Why parse the source rather than introspect at runtime?** No runtime introspection API exists (the parser is a `switch`). Parsing `case "--…":` lines is a one-line `grep` and is robust as long as that idiom is preserved — which it has been for the lifetime of the file.

**Alternative considered: a separate test file.** Rejected. `ccsearch.test.sh` is the project's only smoke test for this CLI; keeping the drift guard alongside the existing assertions means it runs on every contributor's `make` workflow without further wiring.

### Decision 4: Exit codes and the constraints list go in `Notes:`, not per-flag

Exit code semantics already live in a banner comment at the top of `bin/ccsearch`. We mirror them in a single `Notes:` block at the end of `--help`. Per-flag constraint mentions (e.g., on `--regex`: "without a query, requires `--scan`") are kept short — the full constraint list is restated in `Notes:` so the user gets it in both places.

## Risks / Trade-offs

- **Risk: help text grows from ~17 to ~50-60 lines, exceeding one screen.** → Mitigation: we accept it. Long-form `--help` is the right place for completeness; users who want the terse synopsis can pipe through `head` or read the README. The synopsis block at the top still gives the one-screen overview.
- **Risk: the drift guard's source-parsing regex misses a `case` written non-canonically (e.g., split across lines).** → Mitigation: `parseArgs` has a consistent `case "--flag":` style across all current entries. If a future contributor breaks the pattern, the test will fail with a clear-enough message that the fix is obvious. We document the pattern in a one-line comment above the option `switch`.
- **Risk: README and `--help` wording drift over time even with both present.** → Mitigation: a one-line comment at the top of the OPTIONS table in `bin/ccsearch` points to the README section, and vice versa. Both being short and table-shaped makes side-by-side review easy in PRs. We don't attempt automated cross-validation; the drift between two static text blocks is a much smaller class than the drift between parser and help that we're actually fixing.
- **Trade-off: zero-deps means writing a small formatter ourselves** (`padEnd` for the flag column, line wrap). The formatter is ~20 lines and ships in the same file. Cheaper than adopting and pinning a CLI library.

## Migration Plan

No migration needed. Help text is non-breaking and no consumer parses it. Rollback is a single-file revert of `bin/ccsearch` plus the new test block.
