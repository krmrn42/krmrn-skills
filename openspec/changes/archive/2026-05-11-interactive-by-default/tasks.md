## 1. Parser: add `--list` and update `--interactive`

- [x] 1.1 In `parseArgs` (`plugins/chat-search/bin/ccsearch`), add `args.list = false` to the defaults object and a `case "--list":` / `case "-l":` branch that sets it to `true`.
- [x] 1.2 Add a parser-level mutex check: if `args.list && args.interactive`, call `dieUser("--list and -i are mutually exclusive")`.
- [x] 1.3 Keep `args.interactive` and the existing `case "-i": case "--interactive":` branches untouched (still toggles `args.interactive = true`). No semantic change in the parser — semantics shift in `main()` only.

## 2. Dispatch: introduce `selectMode`

- [x] 2.1 Add a pure function `function selectMode(args, stdio) → "picker" | "one-shot"` near the top of `main()` in `bin/ccsearch`. Implement the predicate as documented in design.md §Decision 1 (preview/reindex/index-status are short-circuited before this call, so they need not be considered here).
- [x] 2.2 Wire `selectMode` into `main()`: after the existing `--preview` / `--reindex` / `--index-status` short-circuits (currently around `bin/ccsearch:768-816`), replace the `if (args.interactive) { ...picker... } else { runOneShot(...) }` dispatch with `const mode = selectMode(args, { stdinTTY: process.stdin.isTTY, stdoutTTY: process.stdout.isTTY }); if (mode === "picker") { ...picker... } else { runOneShot(...) }`.
- [x] 2.3 Move the `args.format === null ? (isTTY ? "text" : "tsv")` resolution out of `validateArgs` (`bin/ccsearch:718-720`) and into the one-shot branch only. Picker mode never reads `args.format`, but leaving it `null` there avoids accidental coupling.
- [x] 2.4 Remove the picker-internal TTY-required-failure path *from the default flow* by leaving `picker.js:116` exactly as-is; `selectMode` guarantees the picker is never entered without TTY in the default path, so the check is now defense-in-depth for explicit `-i` (and the existing EXIT_ENV behavior there is exactly what we want for explicit `-i` on non-TTY).
- [x] 2.5 Export `selectMode` conditionally for tests: at the bottom of `bin/ccsearch`, add `if (process.env.CCSEARCH_TEST) module.exports = { selectMode };` guarded so it has no effect in production.

## 3. Help and flag-entry edits

- [x] 3.1 In `buildHelp()` (`bin/ccsearch:557-580`): add `--list` / `-l` to the synopsis and to the body; update the `-i` / `--interactive` description to "open the TUI explicitly (default on a TTY; flag kept for backward compatibility and explicit invocation)"; make `[query]` optional in the synopsis (it already is, but the description should now state this). Note: this may collide with `improve-ccsearch-help`'s rewrite — see design.md §Decision 3; whichever lands first wins, the other rebases its three-line surface.
- [x] 3.2 Update the "no query provided" `dieUser` call in `runOneShot` (`bin/ccsearch:733-738`) to direct the user to `--list` or to remove `-i` from the hint — but only the message is updated; the error path itself stays (it still applies when stdin is non-TTY and no query/regex is supplied).

## 4. Tests

- [x] 4.1 In `plugins/chat-search/bin/ccsearch.test.sh`, add a `node -e` block that sets `CCSEARCH_TEST=1`, requires `./bin/ccsearch`, and asserts the dispatch matrix:
  - `selectMode({ interactive: false, list: false, format: null, regex: null }, { stdinTTY: true, stdoutTTY: true })` === `"picker"` (new default)
  - same args with `stdoutTTY: false` === `"one-shot"` (pipe)
  - same args with `stdinTTY: false` === `"one-shot"` (heredoc / cmd substitution)
  - `{ interactive: false, list: true, format: null, regex: null }` + TTY === `"one-shot"`
  - `{ interactive: false, list: false, format: "text", regex: null }` + TTY === `"one-shot"`
  - `{ interactive: false, list: false, format: "tsv", regex: null }` + TTY === `"one-shot"`
  - `{ interactive: false, list: false, format: null, regex: "foo" }` + TTY === `"one-shot"`
  - `{ interactive: true, list: false, format: null, regex: null }` + TTY === `"picker"`
  - `{ interactive: true, list: false, format: null, regex: null }` + non-TTY === `"picker"` (`-i` overrides TTY inference; the picker itself will EXIT_ENV when actually invoked)
- [x] 4.2 Add a shell-level assertion: `ccsearch --list "foo" </dev/null` (forcing non-interactive stdin) exits `0`, produces text output, and stdout is not empty.
- [x] 4.3 Add a shell-level assertion: `ccsearch --list -i "foo"` exits with `EXIT_USER` (`1`) and prints the mutex message to stderr.
- [x] 4.4 Add a shell-level assertion: `ccsearch --format=text --no-color --limit=10 "foo" </dev/null` (the slash-command invocation shape) exits `0` and prints text output — regression guard for `/chat-search:find`.
- [x] 4.5 Add a shell-level assertion: `ccsearch "foo" </dev/null | head -1` exits `0` and the first line is a TSV row (pipe forces tsv).

## 5. Docs

- [x] 5.1 Rewrite the "Modes" section of `plugins/chat-search/README.md` (around lines 12-20) to lead with the TUI as default, then describe one-shot and `--list`.
- [x] 5.2 Update the flag reference table (around lines 130-141): change `-i` row to "open the TUI explicitly (default on a TTY)"; add `--list` / `-l` row; mark `<query>` positional as optional.
- [x] 5.3 Add a "Migrating from <previous-version>" note near the top of the README (or under the Modes section) listing the two opt-out paths.

## 6. Verify end-to-end

- [x] 6.1 Ran `bash plugins/chat-search/bin/ccsearch.test.sh` — 64 PASS, 0 FAIL (existing 56 + 8 new: T27 9-case dispatch matrix, T28 --list, T29 mutex, T30 slash-command shape, T31 piped→tsv).
- [ ] 6.2 🚧 NOT VERIFIED (requires a real terminal): run `ccsearch` (no args) and confirm the TUI opens with an empty query. Covered by automated dispatch test (T27 `bare-tty` case → "picker") but not visually verified.
- [ ] 6.3 🚧 NOT VERIFIED (requires a real terminal): run `ccsearch "session timeout"` and confirm the TUI opens pre-filled with that query.
- [ ] 6.4 🚧 NOT VERIFIED (requires a real terminal): run `ccsearch --list "session timeout"` and visually compare to prior text output. Automated equivalent is T28 (--list on stdin-redirected invocation, asserts text output appears).
- [ ] 6.5 🚧 NOT VERIFIED (requires a Claude Code session): `/chat-search:find "session timeout"` rendered output. Regression covered by T30 (slash-command flag shape `--format=text --no-color --limit=10` exits 0, prints text).
- [x] 6.6 `make lint-skills` → exit 0.
