## 1. Inventory and layout draft

- [x] 1.1 List every long-form flag accepted by `parseArgs` in `plugins/chat-search/bin/ccsearch` and pair each with the wording used in the README's "Flag reference" table; flag any mismatch between accepted flags and README rows for explicit reconciliation.
- [x] 1.2 Draft the new help layout on paper / scratch buffer: synopsis line(s), one-line description, `Positional arguments:`, `Options:` groups (filters, output, index management), `Examples:`, `Notes:` (TSV columns, exit codes, runtime). Confirm column widths (flag column ~28 chars, 2-space outer indent) render cleanly at 80-col terminal width.

## 2. Implement OPTIONS table and `buildHelp` rewrite

- [x] 2.1 In `plugins/chat-search/bin/ccsearch`, introduce a local `const OPTIONS = [...]` array immediately above `buildHelp()`. Each entry: `{ flags, placeholder, group, description }`. Covers every flag plus `-h/--help` and the `[query]` positional.
- [x] 2.2 Add a short formatter (`wrapText` + `formatOptionEntry`) that produces a flag column padded to `HELP_FLAG_COL` (28), then the description wrapped at `HELP_WIDTH - HELP_FLAG_COL - 2` width; continuation lines indent to the flag column.
- [x] 2.3 Rewrite `buildHelp()` to emit, in order: synopsis, one-line description, `Positional arguments:`, grouped `Options:` / `Filters:` / `Output:` / `Index management:` blocks iterating OPTIONS, `Examples:`, `Notes:` (TSV columns, constraints, exit codes 0/1/2/3, runtime).
- [x] 2.4 Added a `// Long-form flag cases use \`case "--flag":\` on its own line.` comment above `parseArgs`'s option `switch` documenting the convention the drift-guard test relies on.

## 3. Drift-guard test

- [x] 3.1 Added Test 26 in `bin/ccsearch.test.sh` extracting parser flags (`grep -v // | grep -oE 'case "--…"'`) and help flags (`--help | grep -oE -- '--…'`), comm-diffing both directions. Comment lines are stripped before the grep so the convention comment doesn't false-positive.
- [x] 3.2 Test 23 added: `--help` exits 0, writes to stdout, stderr empty. Test 24 added: `-h` output equals `--help` output byte-for-byte.
- [x] 3.3 Test 25 added: `--help --regex foo --limit 5` (with a bogus DB) exits 0 and prints help.

## 4. Verify

- [x] 4.1 `bash plugins/chat-search/bin/ccsearch.test.sh` → 56 PASS, 0 FAIL.
- [x] 4.2 Manually inspected `bin/ccsearch --help` output — all sections present, every parser flag has a description, layout clean at 80 cols.
- [x] 4.3 Negative test: injected a fake `case "--xyzzy":` branch; drift guard failed with `T26.parser_flags_all_in_help — missing in help: --xyzzy`. Restored.
- [x] 4.4 `make lint-skills` → exit 0.
