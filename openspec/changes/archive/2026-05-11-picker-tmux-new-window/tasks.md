## 1. Parser + env detection

- [x] 1.1 Add `args.noTmux = false` default; `case "--no-tmux":` branch in parseArgs setting it to `true`.
- [x] 1.2 Add OPTIONS table entry for `--no-tmux`.
- [x] 1.3 In `main()`, before calling `runPicker`, compute `tmuxAvailable = !!process.env.TMUX && !args.noTmux`. Pass via `deps.tmuxAvailable`.

## 2. Command builder (pure helper)

- [x] 2.1 In `bin/picker.js`, add a pure function `buildTmuxNewWindowCommand(row, { savedName, projectPathExists })` that returns the tmux argv array:
  ```js
  function buildTmuxNewWindowCommand(row, { savedName }) {
    const windowName = sanitizeTmuxName(
      savedName || row.projectName || (row.projectPath && require("node:path").basename(row.projectPath)) || "claude"
    );
    const cwd = row.projectPath || process.cwd();
    const claudeCmd = savedName
      ? `claude --name ${shellQuote(savedName)} --resume ${row.sessionId}`
      : `claude --resume ${row.sessionId}`;
    return ["new-window", "-n", windowName, "-c", cwd, claudeCmd];
  }
  ```
- [x] 2.2 Add `sanitizeTmuxName(s)`: strips control characters (`/[\x00-\x1f\x7f]/g`), truncates to 40 visible chars with `…` suffix if longer.
- [x] 2.3 Export `buildTmuxNewWindowCommand` + `sanitizeTmuxName` via the `CCSEARCH_TEST` guard for tests.

## 3. Keypress + spawn

- [x] 3.1 In `onKeypress` (browse mode), add:
  ```js
  if (key.ctrl && key.name === "w") {
    if (!deps.tmuxAvailable) {
      process.stderr.write("ccsearch: Ctrl+W requires running inside tmux (no $TMUX in env). Run `--no-tmux` to silence this binding.\n");
      return;
    }
    return finish("resume-tmux-window");
  }
  ```
- [x] 3.2 In `handleAction`, add a `"resume-tmux-window"` branch: call `spawnTmuxNewWindow(row)` which tears down the picker (`teardown()`), builds argv via `buildTmuxNewWindowCommand`, then `childProc.spawnSync("tmux", argv, { stdio: "inherit" })`. Return the spawn exit code.
- [x] 3.3 Update the `exitReason` JSDoc to include `"resume-tmux-window"`.

## 4. Status line gating

- [x] 4.1 In `render`'s help-line builder, append a Ctrl+W entry only when `deps.tmuxAvailable`. (Coordinated with `picker-status-bar` change; if that change has landed, integrate with its bindings list.)

## 5. Tests

- [x] 5.1 `buildTmuxNewWindowCommand` unit tests covering: saved-name present (window-name == saved-name; inner command includes `--name`); no saved-name + projectName (window-name == projectName); no saved-name + no projectName + projectPath (window-name == basename); no projectPath (cwd fallback); long saved name (truncated with `…`); control chars in saved name (stripped).
- [x] 5.2 `sanitizeTmuxName` unit tests: empty → "claude"; ASCII → unchanged; control chars → stripped; > 40 visible chars → truncated.
- [x] 5.3 Integration smoke: with `TMUX=` unset, `ccsearch --no-tmux --help` exits 0 (the flag parses). With `TMUX=fake` and `--no-tmux`, deps.tmuxAvailable is false (verified via a CCSEARCH_TEST export of the gate logic, or via spawning the binary and inspecting render).

## 6. Manual verification

- [ ] 6.1 🚧 NOT VERIFIED (requires real tmux session): inside tmux, Ctrl+W on a row creates a new tmux window running the resumed session.
- [ ] 6.2 🚧 NOT VERIFIED (requires real tmux session): new window's name matches the saved name (or project name).
- [ ] 6.3 🚧 NOT VERIFIED (requires non-tmux terminal): Ctrl+W with $TMUX unset prints the expected stderr line and keeps the picker open.
- [ ] 6.4 🚧 NOT VERIFIED (requires real tmux session): `--no-tmux` disables the binding even inside tmux.

## 7. Docs

- [x] 7.1 README: add Ctrl+W to picker keybindings (with the "inside tmux" caveat).
- [x] 7.2 README: add `--no-tmux` to the flag reference table.
- [x] 7.3 `make lint-skills` → exit 0.
