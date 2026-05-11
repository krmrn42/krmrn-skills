## 1. Inventory and layout draft

- [ ] 1.1 List every long-form flag accepted by `parseArgs` in `plugins/chat-search/bin/ccsearch` and pair each with the wording used in the README's "Flag reference" table; flag any mismatch between accepted flags and README rows for explicit reconciliation.
- [ ] 1.2 Draft the new help layout on paper / scratch buffer: synopsis line(s), one-line description, `Positional arguments:`, `Options:` groups (filters, output, index management), `Examples:`, `Notes:` (TSV columns, exit codes, runtime). Confirm column widths (flag column ~28 chars, 2-space outer indent) render cleanly at 80-col terminal width.

## 2. Implement OPTIONS table and `buildHelp` rewrite

- [ ] 2.1 In `plugins/chat-search/bin/ccsearch`, introduce a local `const OPTIONS = [...]` array immediately above `buildHelp()`. Each entry: `{ flags, placeholder, group, description, defaultText }`. Cover every flag listed in §1.1 plus `-h/--help` and the `[query]` positional.
- [ ] 2.2 Add a short formatter (`formatOption(entry, flagColWidth)`) that produces a flag column padded to `flagColWidth`, then the description wrapped at terminal-ish width (hard-coded 80 cols; continuation lines indent to the flag column).
- [ ] 2.3 Rewrite `buildHelp()` to emit, in order: synopsis (mostly preserved from current), one-line description, `Positional arguments:` block (`[query]`), `Options:` headers per group iterating the OPTIONS table, `Examples:` block (preserved from current), `Notes:` block listing TSV columns, exit codes 0/1/2/3, and the inter-flag constraints (`--only-user`/`--include-tools` mutex; `--regex` without query requires `--scan`; `--format` ∈ {`text`,`tsv`}; `--since` is `YYYY-MM-DD`; `--limit` is positive integer; runtime ≥ Node 22.5).
- [ ] 2.4 Add a one-line comment above `parseArgs`'s option `switch` documenting the `case "--flag":` convention that the drift-guard test relies on.

## 3. Drift-guard test

- [ ] 3.1 In `plugins/chat-search/bin/ccsearch.test.sh`, add an assertion block that:
  - extracts the set of long-form flags from the source: `grep -oE 'case "--[a-z][a-z-]+"' bin/ccsearch | sort -u`,
  - extracts the set of long-form flags from `bin/ccsearch --help`: `bin/ccsearch --help | grep -oE -- '--[a-z][a-z-]+' | sort -u`,
  - diffs the two sets and fails (non-zero exit) with a clear message if any flag is in the parser but not in help (or vice versa).
- [ ] 3.2 Add an assertion that `bin/ccsearch --help` exits `0`, writes to stdout, and produces empty stderr; and that `bin/ccsearch -h` output equals `bin/ccsearch --help` output byte-for-byte.
- [ ] 3.3 Add an assertion that `bin/ccsearch --help --regex foo --limit 5` exits `0` and prints help (does not attempt a query).

## 4. Verify

- [ ] 4.1 Run `bash plugins/chat-search/bin/ccsearch.test.sh` locally and confirm exit `0` with all new assertions executed (assertion log lines visible in output).
- [ ] 4.2 Manually inspect `bin/ccsearch --help` output at an 80-col terminal; verify each section header appears, every parser flag has a description, and the layout matches the design's example block.
- [ ] 4.3 Negative test: temporarily add a fake `case "--xyzzy":` branch to `parseArgs` without touching `buildHelp`, rerun the test, confirm it fails with a message naming `--xyzzy`, then revert.
- [ ] 4.4 Run `make lint-skills-strict` (or `make lint-skills`) from the repo root to confirm no skill / manifest regressions were introduced (no skill files are changed, but the linter runs project-wide).
