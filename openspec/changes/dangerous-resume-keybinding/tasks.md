## 1. Parser

- [ ] 1.1 In `parseArgs` (`plugins/chat-search/bin/ccsearch`), add `args.dangerouslySkipPermissions = false` to the defaults object.
- [ ] 1.2 Add a `case "--dangerously-skip-permissions":` branch in the option `switch` that sets `args.dangerouslySkipPermissions = true`. No value follows the flag (boolean).

## 2. Wire flag into picker deps

- [ ] 2.1 In `main()` where `runPicker` is called (`bin/ccsearch:820-836`), add `dangerouslySkipPermissions: args.dangerouslySkipPermissions` to the `deps` object.

## 3. Picker keypress + spawn

- [ ] 3.1 In `bin/picker.js`, inside `onKeypress` (`picker.js:442+`), add the dangerous-resume branch **before** the plain `return` branch (`picker.js:450`):
  ```js
  if ((key.meta || key.shift) && key.name === "return") {
    if (deps.dangerouslySkipPermissions) return finish("resume-dangerous");
    // not armed → fall through to plain resume so Alt/Shift+Enter on
    // an unarmed picker still resumes (better UX than silent no-op)
    return finish("resume");
  }
  ```
  Note: the fall-through to plain "resume" when not armed is intentional — a user who hits Alt+Enter without the flag set still gets the expected "resume this row" behavior, just without the dangerous flag.
- [ ] 3.2 In `handleAction` (`picker.js:406+`), add a branch: `if (reason === "resume-dangerous") return spawnClaude("resume-dangerous", row);`.
- [ ] 3.3 In `spawnClaude` (`picker.js:365`), extend the argv selection (currently lines 384-387) to a 3-way switch:
  ```js
  let claudeArgs;
  if (action === "fork") {
    claudeArgs = ["--fork-session", "--resume", row.sessionId];
  } else if (action === "resume-dangerous") {
    claudeArgs = ["--dangerously-skip-permissions", "--resume", row.sessionId];
  } else {
    claudeArgs = ["--resume", row.sessionId];
  }
  ```
- [ ] 3.4 Update the `exitReason` JSDoc comment at `picker.js:136` to include `"resume-dangerous"` in the listed types.

## 4. Help line styling

- [ ] 4.1 In `bin/picker.js`'s `render` function, locate the help-line write (`picker.js:271-279`).
- [ ] 4.2 Replace the static help string with a builder that conditionally prepends the yellow entry when `deps.dangerouslySkipPermissions === true`:
  ```js
  const dangerEntry = deps.dangerouslySkipPermissions
    ? "  " + ansi.fgYellow + "Alt-Enter dangerous" + ansi.reset
    : "";
  const helpLine =
    "Enter resume" + dangerEntry +
    "   Ctrl-F fork   Ctrl-O print id   Ctrl-D print path   Esc cancel";
  stdout.write(ansi.dim + truncateToWidth(helpLine, cols) + ansi.reset);
  ```
  Important: ANSI color codes inside the dim wrapper need to keep yellow visible — verify on a real terminal that the yellow shows through the dim envelope (it does for `fgYellow + reset` because reset closes the yellow before the line ends; the outer `dim` re-applies for any unstyled portion).

## 5. Help text

- [ ] 5.1 In `bin/ccsearch`'s `buildHelp()`, add a line entry for `--dangerously-skip-permissions`. If the `improve-ccsearch-help` change has already landed, add an `OPTIONS` table row in the "misc" or "index management" group with: flag `--dangerously-skip-permissions`, no placeholder, description "Arm the Alt+Enter binding in the picker to resume with `claude --dangerously-skip-permissions`. Best-effort Shift+Enter binding on CSI-u terminals. No effect on one-shot output." If `improve-ccsearch-help` has NOT landed yet, add a single new line to the synopsis and a paragraph in the body describing the flag.

## 6. Tests

- [ ] 6.1 In `bin/ccsearch.test.sh`, add a smoke assertion: `bin/ccsearch --dangerously-skip-permissions --help` exits `0` and stdout contains the string `--dangerously-skip-permissions`.
- [ ] 6.2 Add a parser-level assertion via `node -e` using the `CCSEARCH_TEST` export pattern (added by either `interactive-by-default` or this change, whichever lands first): assert `parseArgs(["--dangerously-skip-permissions"]).dangerouslySkipPermissions === true` and `parseArgs([]).dangerouslySkipPermissions === false`.
- [ ] 6.3 If neither `interactive-by-default` nor this change has yet exported anything via `CCSEARCH_TEST`, add the export-guard pattern in `bin/ccsearch` (at the very bottom): `if (process.env.CCSEARCH_TEST) module.exports = { parseArgs };` so the parser is testable. If another change already added the export, extend it.

## 7. Manual verification

- [ ] 7.1 Run `ccsearch --dangerously-skip-permissions` on a real terminal (after the `interactive-by-default` change has armed the TUI by default, or use `ccsearch -i --dangerously-skip-permissions`). Verify the picker opens with the yellow `Alt-Enter dangerous` entry visible in the help line.
- [ ] 7.2 Press plain Enter on a row — verify it resumes with `claude --resume <id>` (no dangerous flag). Confirm via `ps` or by checking the Claude session that permissions still prompt.
- [ ] 7.3 Press Alt+Enter on a row — verify it resumes with `claude --dangerously-skip-permissions --resume <id>`. Confirm by checking that Claude no longer prompts on tool use within that session.
- [ ] 7.4 On a terminal that distinguishes Shift+Enter (Kitty, WezTerm, iTerm2 with CSI-u, Windows Terminal w/ enhanced kb), press Shift+Enter — verify dangerous resume fires.
- [ ] 7.5 On a non-CSI-u terminal (xterm, GNOME Terminal, macOS Terminal.app default, tmux without passthrough), press Shift+Enter — verify it behaves identically to plain Enter (normal resume, no dangerous flag).
- [ ] 7.6 Run `ccsearch` (no flag) on a real terminal — verify the help line shows NO yellow entry. Press Alt+Enter on a row — verify it falls through to plain resume (per Task §3.1 fall-through; expected behavior).
- [ ] 7.7 Run `ccsearch --dangerously-skip-permissions --list "foo" </dev/null` — verify the printed `resumeOneLiner` lines do NOT contain `--dangerously-skip-permissions`. Verify the process exits cleanly.

## 8. Docs

- [ ] 8.1 Update `plugins/chat-search/README.md`'s "Picker" section: add a paragraph describing `--dangerously-skip-permissions` and the Alt+Enter binding, with the Shift+Enter terminal-compat caveat.
- [ ] 8.2 Add a row to the flag reference table (~lines 130-141) for `--dangerously-skip-permissions`.
- [ ] 8.3 Run `make lint-skills-strict` from the repo root to confirm no regressions.
