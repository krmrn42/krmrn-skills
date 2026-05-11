## 1. Parser

- [x] 1.1 In `parseArgs` (`plugins/chat-search/bin/ccsearch`), add `args.dangerouslySkipPermissions = false` to the defaults object.
- [x] 1.2 Add a `case "--dangerously-skip-permissions":` branch in the option `switch` that sets `args.dangerouslySkipPermissions = true`. No value follows the flag (boolean).

## 2. Wire flag into picker deps

- [x] 2.1 In `main()` where `runPicker` is called (`bin/ccsearch:820-836`), add `dangerouslySkipPermissions: args.dangerouslySkipPermissions` to the `deps` object.

## 3. Picker keypress + spawn

- [x] 3.1 In `bin/picker.js`, inside `onKeypress` (`picker.js:442+`), add the dangerous-resume branch **before** the plain `return` branch (`picker.js:450`):
  ```js
  if ((key.meta || key.shift) && key.name === "return") {
    if (deps.dangerouslySkipPermissions) return finish("resume-dangerous");
    // not armed → fall through to plain resume so Alt/Shift+Enter on
    // an unarmed picker still resumes (better UX than silent no-op)
    return finish("resume");
  }
  ```
  Note: the fall-through to plain "resume" when not armed is intentional — a user who hits Alt+Enter without the flag set still gets the expected "resume this row" behavior, just without the dangerous flag.
- [x] 3.2 In `handleAction` (`picker.js:406+`), add a branch: `if (reason === "resume-dangerous") return spawnClaude("resume-dangerous", row);`.
- [x] 3.3 In `spawnClaude` (`picker.js:365`), extend the argv selection (currently lines 384-387) to a 3-way switch:
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
- [x] 3.4 Update the `exitReason` JSDoc comment at `picker.js:136` to include `"resume-dangerous"` in the listed types.

## 4. Help line styling

- [x] 4.1 In `bin/picker.js`'s `render` function, locate the help-line write (`picker.js:271-279`).
- [x] 4.2 Replace the static help string with a builder that conditionally prepends the yellow entry when `deps.dangerouslySkipPermissions === true`:
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

- [x] 5.1 In `bin/ccsearch`'s `buildHelp()`, add a line entry for `--dangerously-skip-permissions`. If the `improve-ccsearch-help` change has already landed, add an `OPTIONS` table row in the "misc" or "index management" group with: flag `--dangerously-skip-permissions`, no placeholder, description "Arm the Alt+Enter binding in the picker to resume with `claude --dangerously-skip-permissions`. Best-effort Shift+Enter binding on CSI-u terminals. No effect on one-shot output." If `improve-ccsearch-help` has NOT landed yet, add a single new line to the synopsis and a paragraph in the body describing the flag.

## 6. Tests

- [x] 6.1 In `bin/ccsearch.test.sh`, add a smoke assertion: `bin/ccsearch --dangerously-skip-permissions --help` exits `0` and stdout contains the string `--dangerously-skip-permissions`.
- [x] 6.2 Add a parser-level assertion via `node -e` using the `CCSEARCH_TEST` export pattern (added by either `interactive-by-default` or this change, whichever lands first): assert `parseArgs(["--dangerously-skip-permissions"]).dangerouslySkipPermissions === true` and `parseArgs([]).dangerouslySkipPermissions === false`.
- [x] 6.3 If neither `interactive-by-default` nor this change has yet exported anything via `CCSEARCH_TEST`, add the export-guard pattern in `bin/ccsearch` (at the very bottom): `if (process.env.CCSEARCH_TEST) module.exports = { parseArgs };` so the parser is testable. If another change already added the export, extend it.

## 7. Manual verification

- [ ] 7.1 🚧 NOT VERIFIED (requires real terminal): `ccsearch --dangerously-skip-permissions` shows the yellow `Alt-Enter dangerous` entry. The help-line render branch is in place and is gated on `deps.dangerouslySkipPermissions`.
- [ ] 7.2 🚧 NOT VERIFIED (requires real terminal): plain Enter resumes with no dangerous flag. The spawnClaude argv is constructed in a 3-way switch and the `"resume"` case is unchanged.
- [ ] 7.3 🚧 NOT VERIFIED (requires real terminal): Alt+Enter resumes with `--dangerously-skip-permissions`. The spawn argv `["--dangerously-skip-permissions", "--resume", row.sessionId]` is in place but the keystroke path can only be tested with a TTY + raw-mode + a real `claude` binary.
- [ ] 7.4 🚧 NOT VERIFIED (requires CSI-u terminal): Shift+Enter on Kitty/WezTerm/iTerm2/Windows Terminal fires dangerous resume.
- [ ] 7.5 🚧 NOT VERIFIED (requires non-CSI-u terminal): Shift+Enter on xterm/GNOME Terminal/etc. falls through to plain resume.
- [ ] 7.6 🚧 NOT VERIFIED (requires real terminal): without the flag, help line shows NO yellow entry; Alt+Enter falls through to plain resume.
- [x] 7.7 `ccsearch --dangerously-skip-permissions --format=text 'session timeout' </dev/null` exits cleanly and the printed `claude --resume` one-liners do NOT contain `--dangerously-skip-permissions`. Asserted by T36.

## 8. Docs

- [x] 8.1 Update `plugins/chat-search/README.md`'s "Picker" section: add a paragraph describing `--dangerously-skip-permissions` and the Alt+Enter binding, with the Shift+Enter terminal-compat caveat.
- [x] 8.2 Add a row to the flag reference table (~lines 130-141) for `--dangerously-skip-permissions`.
- [x] 8.3 Run `make lint-skills-strict` from the repo root to confirm no regressions.
