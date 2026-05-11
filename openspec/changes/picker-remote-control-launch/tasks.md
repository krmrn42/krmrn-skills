## 1. Argv construction — extract a pure helper

- [ ] 1.1 In `bin/picker.js`, extract the existing 3-way argv switch in `spawnClaude` (`"fork"` / `"resume-dangerous"` / `"resume"`) into a pure function `buildClaudeArgs(action, row, opts)` where `opts` carries `{ savedName }`.
- [ ] 1.2 Make `spawnClaude` call `buildClaudeArgs(action, row, { savedName: deps.sessionStore?.names?.[row.sessionId] || null })` and use the returned array.
- [ ] 1.3 Add a 4-way branch in `buildClaudeArgs`: `action === "resume-remote-control"` → `["--remote-control", ...(savedName ? [savedName] : []), "--resume", row.sessionId]`. Note: for this action specifically, do NOT add `--name` even when savedName is present.
- [ ] 1.4 Export `buildClaudeArgs` via the `CCSEARCH_TEST` guard so it's unit-testable.

## 2. Picker keybinding

- [ ] 2.1 In `bin/picker.js` `onKeypress` (browse mode only), add `if (key.ctrl && key.name === "t") return finish("resume-remote-control");` placed before the plain-`return` branch.
- [ ] 2.2 In `handleAction`, add a branch `if (reason === "resume-remote-control") return spawnClaude("resume-remote-control", row);`.
- [ ] 2.3 Update the `exitReason` JSDoc on line 136 (or wherever it lives after prior changes) to include the new action type.

## 3. Help text

- [ ] 3.1 In `bin/ccsearch`'s OPTIONS table or in a `Picker keybindings:` epilog section of `buildHelp`, mention Ctrl+T → "spawn `claude --remote-control [name] --resume <id>` from the picker (uses saved name from `sessions.json` when present)".

## 4. Tests

- [ ] 4.1 Add a `buildClaudeArgs` unit test (via the CCSEARCH_TEST export) covering all action × savedName combinations:
  - `resume` + no name → `["--resume", "<id>"]`
  - `resume` + name → `["--name", "<name>", "--resume", "<id>"]`
  - `resume-dangerous` + no name → `["--dangerously-skip-permissions", "--resume", "<id>"]`
  - `resume-dangerous` + name → `["--dangerously-skip-permissions", "--name", "<name>", "--resume", "<id>"]`
  - `fork` + no name → `["--fork-session", "--resume", "<id>"]`
  - `fork` + name → `["--fork-session", "--name", "<name>", "--resume", "<id>"]`
  - `resume-remote-control` + no name → `["--remote-control", "--resume", "<id>"]`
  - `resume-remote-control` + name → `["--remote-control", "<name>", "--resume", "<id>"]`  (NO --name)

## 5. Manual verification

- [ ] 5.1 🚧 NOT VERIFIED (requires real terminal + configured Remote Control): Ctrl+T on a row launches `claude --remote-control --resume <id>` correctly.
- [ ] 5.2 🚧 NOT VERIFIED (requires real terminal): Ctrl+T on a renamed row launches with `--remote-control <name>`.

## 6. Docs

- [ ] 6.1 README: add Ctrl+T to picker keybindings.
- [ ] 6.2 README: note that remote-control uses the saved name when present (one sentence).
- [ ] 6.3 `make lint-skills` → exit 0.
