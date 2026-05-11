## Why

The `ccsearch -h` / `--help` output today is a synopsis line followed by examples — it never explains what individual flags do, what they accept, what their defaults are, or how they combine. Users who want flag meanings have to leave the terminal and read the README. Worse, several flags the CLI actually accepts (`--reindex`, `--index-status`, `--preview`, `--no-color`, `--db-path`) don't even appear in the synopsis, so they are effectively undocumented at the help surface. A self-documenting `--help` is the baseline expectation for a standalone CLI; we ship one.

## What Changes

- Rewrite `buildHelp()` in `plugins/chat-search/bin/ccsearch` to produce an argparse-style help layout: synopsis → one-line description → `Positional arguments:` block → `Options:` block (grouped: filters, output, index management, misc) → `Examples:` → notes (TSV columns, runtime, exit codes, mutually-exclusive flag pairs).
- Document **every** flag the parser accepts, including the previously hidden `--reindex`, `--index-status`, `--preview SESSION_ID`, `--no-color`, and `--db-path PATH`. Each entry lists: long form, short form (if any), placeholder (e.g., `PAT`, `N`, `YYYY-MM-DD`), one-line meaning, default (when relevant), and constraint notes (e.g., "requires `--scan` when used without a positional query").
- Surface constraints that are currently only enforced by `dieUser` at runtime: `--only-user` ⊕ `--include-tools`, `--regex` without query requires `--scan`, `--format` ∈ {`text`,`tsv`}, `--since` is `YYYY-MM-DD`, `--limit` is a positive integer.
- Keep the current "Examples" and runtime/exit-code notes; just relocate them into the new structured layout.
- Add a smoke assertion to `bin/ccsearch.test.sh` that `ccsearch --help` exits 0, prints to stdout, and the output mentions every long-form flag name accepted by `parseArgs`. This guards against the parser and help text drifting apart again.

Not in scope: changing flag names, semantics, defaults, or the README. The README options table stays the canonical reference; this change makes the on-terminal help carry equivalent information so users don't need to leave the terminal.

## Capabilities

### New Capabilities

- `ccsearch-cli-help`: The `ccsearch` CLI's `-h` / `--help` output. Defines what users must be able to learn about every accepted flag and positional argument without consulting external documentation, plus the structural requirements that keep help and parser in sync.

### Modified Capabilities

<!-- None. `openspec/specs/` is currently empty; nothing exists to amend. -->

## Impact

- **Code**: `plugins/chat-search/bin/ccsearch` — `buildHelp()` is rewritten; no other functions change. No new dependencies (still zero-deps, Node ≥ 22.5).
- **Tests**: `plugins/chat-search/bin/ccsearch.test.sh` — one new assertion block. Existing assertions unchanged.
- **Docs**: `plugins/chat-search/README.md` is unchanged. The new help intentionally mirrors the README's options table so contributors have one place to update both.
- **Users**: `ccsearch --help` output grows from ~17 lines to roughly 50-60 lines. No behavior change for any non-help invocation.
- **Pipelines**: None. `--help` was not previously parsed by any known consumer; the slash command `/chat-search:find` invokes `ccsearch` with fixed flags and never reads `--help`.
- **Risk**: Low. Help text is non-load-bearing; the only failure mode is the new test catching genuine drift between parser and help, which is the point.
