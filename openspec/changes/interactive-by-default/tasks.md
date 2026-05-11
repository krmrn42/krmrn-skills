## 1. Parser: add `--list` and update `--interactive`

- [ ] 1.1 In `parseArgs` (`plugins/chat-search/bin/ccsearch`), add `args.list = false` to the defaults object and a `case "--list":` / `case "-l":` branch that sets it to `true`.
- [ ] 1.2 Add a parser-level mutex check: if `args.list && args.interactive`, call `dieUser("--list and -i are mutually exclusive")`.
- [ ] 1.3 Keep `args.interactive` and the existing `case "-i": case "--interactive":` branches untouched (still toggles `args.interactive = true`). No semantic change in the parser — semantics shift in `main()` only.

## 2. Dispatch: introduce `selectMode`

- [ ] 2.1 Add a pure function `function selectMode(args, stdio) → "picker" | "one-shot"` near the top of `main()` in `bin/ccsearch`. Implement the predicate as documented in design.md §Decision 1 (preview/reindex/index-status are short-circuited before this call, so they need not be considered here).
- [ ] 2.2 Wire `selectMode` into `main()`: after the existing `--preview` / `--reindex` / `--index-status` short-circuits (currently around `bin/ccsearch:768-816`), replace the `if (args.interactive) { ...picker... } else { runOneShot(...) }` dispatch with `const mode = selectMode(args, { stdinTTY: process.stdin.isTTY, stdoutTTY: process.stdout.isTTY }); if (mode === "picker") { ...picker... } else { runOneShot(...) }`.
- [ ] 2.3 Move the `args.format === null ? (isTTY ? "text" : "tsv")` resolution out of `validateArgs` (`bin/ccsearch:718-720`) and into the one-shot branch only. Picker mode never reads `args.format`, but leaving it `null` there avoids accidental coupling.
- [ ] 2.4 Remove the picker-internal TTY-required-failure path *from the default flow* by leaving `picker.js:116` exactly as-is; `selectMode` guarantees the picker is never entered without TTY in the default path, so the check is now defense-in-depth for explicit `-i` (and the existing EXIT_ENV behavior there is exactly what we want for explicit `-i` on non-TTY).
- [ ] 2.5 Export `selectMode` conditionally for tests: at the bottom of `bin/ccsearch`, add `if (process.env.CCSEARCH_TEST) module.exports = { selectMode };` guarded so it has no effect in production.

## 3. Help and flag-entry edits

- [ ] 3.1 In `buildHelp()` (`bin/ccsearch:557-580`): add `--list` / `-l` to the synopsis and to the body; update the `-i` / `--interactive` description to "open the TUI explicitly (default on a TTY; flag kept for backward compatibility and explicit invocation)"; make `[query]` optional in the synopsis (it already is, but the description should now state this). Note: this may collide with `improve-ccsearch-help`'s rewrite — see design.md §Decision 3; whichever lands first wins, the other rebases its three-line surface.
- [ ] 3.2 Update the "no query provided" `dieUser` call in `runOneShot` (`bin/ccsearch:733-738`) to direct the user to `--list` or to remove `-i` from the hint — but only the message is updated; the error path itself stays (it still applies when stdin is non-TTY and no query/regex is supplied).

## 4. Tests

- [ ] 4.1 In `plugins/chat-search/bin/ccsearch.test.sh`, add a `node -e` block that sets `CCSEARCH_TEST=1`, requires `./bin/ccsearch`, and asserts the dispatch matrix:
  - `selectMode({ interactive: false, list: false, format: null, regex: null }, { stdinTTY: true, stdoutTTY: true })` === `"picker"` (new default)
  - same args with `stdoutTTY: false` === `"one-shot"` (pipe)
  - same args with `stdinTTY: false` === `"one-shot"` (heredoc / cmd substitution)
  - `{ interactive: false, list: true, format: null, regex: null }` + TTY === `"one-shot"`
  - `{ interactive: false, list: false, format: "text", regex: null }` + TTY === `"one-shot"`
  - `{ interactive: false, list: false, format: "tsv", regex: null }` + TTY === `"one-shot"`
  - `{ interactive: false, list: false, format: null, regex: "foo" }` + TTY === `"one-shot"`
  - `{ interactive: true, list: false, format: null, regex: null }` + TTY === `"picker"`
  - `{ interactive: true, list: false, format: null, regex: null }` + non-TTY === `"picker"` (`-i` overrides TTY inference; the picker itself will EXIT_ENV when actually invoked)
- [ ] 4.2 Add a shell-level assertion: `ccsearch --list "foo" </dev/null` (forcing non-interactive stdin) exits `0`, produces text output, and stdout is not empty.
- [ ] 4.3 Add a shell-level assertion: `ccsearch --list -i "foo"` exits with `EXIT_USER` (`1`) and prints the mutex message to stderr.
- [ ] 4.4 Add a shell-level assertion: `ccsearch --format=text --no-color --limit=10 "foo" </dev/null` (the slash-command invocation shape) exits `0` and prints text output — regression guard for `/chat-search:find`.
- [ ] 4.5 Add a shell-level assertion: `ccsearch "foo" </dev/null | head -1` exits `0` and the first line is a TSV row (pipe forces tsv).

## 5. Docs

- [ ] 5.1 Rewrite the "Modes" section of `plugins/chat-search/README.md` (around lines 12-20) to lead with the TUI as default, then describe one-shot and `--list`.
- [ ] 5.2 Update the flag reference table (around lines 130-141): change `-i` row to "open the TUI explicitly (default on a TTY)"; add `--list` / `-l` row; mark `<query>` positional as optional.
- [ ] 5.3 Add a "Migrating from <previous-version>" note near the top of the README (or under the Modes section) listing the two opt-out paths.

## 6. Verify end-to-end

- [ ] 6.1 Run `bash plugins/chat-search/bin/ccsearch.test.sh` — confirm exit `0` with every new assertion executed.
- [ ] 6.2 On a real terminal, run `ccsearch` (no args) — verify the TUI opens with an empty query.
- [ ] 6.3 On a real terminal, run `ccsearch "session timeout"` — verify the TUI opens with the query pre-filled and showing ranked results.
- [ ] 6.4 On a real terminal, run `ccsearch --list "session timeout"` — verify it prints the same text output as `ccsearch "session timeout"` produced before this change.
- [ ] 6.5 In a Claude Code session, invoke `/chat-search:find "session timeout"` — verify the rendered top-10 list appears inline and no TTY error is raised.
- [ ] 6.6 Run `make lint-skills-strict` from the repo root to confirm no regressions.
