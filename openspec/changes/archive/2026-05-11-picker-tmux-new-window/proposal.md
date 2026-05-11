## Why

When the user runs `ccsearch` inside a tmux session, plain Enter (resume) replaces the current pane's foreground process with the resumed Claude session. That's the right default for most invocations — but it's wrong when the user wants to *keep* their current pane (an editor, a logs tail, a terminal with shell history they want to preserve) and have the Claude session in a side-by-side or background tmux window. Today that means: Ctrl+O to print the session id, copy it, switch tmux windows, paste it into a fresh `claude --resume`. Multi-step.

A picker keybinding that says "resume this in a new tmux window" reduces that to one keystroke. If the session has a saved name (`picker-rename-session`), the new tmux window inherits that name — no more `bash`-titled windows you can't tell apart.

## What Changes

- New picker keybinding **Ctrl+W** ("window") on a selected row: when `$TMUX` is set in the environment, spawn `tmux new-window -n <window-name> -c <project_path> 'claude --resume <id>'`. The picker exits cleanly after invoking tmux; the new window opens in the background by default (tmux's `new-window` default), so the user's current pane is undisturbed.
- Window name resolution: (1) if the row has a saved name in `sessions.json.names`, use that; (2) else use the row's `projectName` (or `basename(projectPath)` as a final fallback); (3) tmux truncates long names — we pre-truncate to 40 chars to keep the tab bar readable.
- When `$TMUX` is **not** set (the user is not inside tmux), Ctrl+W is a no-op with a one-line stderr message: `"ccsearch: Ctrl+W requires running inside tmux (no $TMUX in env)"`. The picker stays open.
- Help line / status bar entry shows Ctrl+W only when `$TMUX` is set, so users outside tmux don't see a binding they can't use.
- `tmux` itself is detected once at picker startup (read `process.env.TMUX`); the value is passed through `deps` so render and onKeypress can branch on it.
- New CLI flag `--no-tmux` to suppress the binding even when `$TMUX` is set (for users whose tmux is wrapped or nested in ways that break `tmux new-window`). The CLI flag is a defensible escape hatch; the picker simply treats `args.noTmux === true` as `$TMUX` being unset.

## Capabilities

### New Capabilities

- `ccsearch-tmux-window-launch`: Defines the Ctrl+W keybinding, the `$TMUX` env-var detection, the `tmux new-window` invocation shape, the window-name resolution rules, and the `--no-tmux` escape hatch.

### Modified Capabilities

<!-- None. -->

## Impact

- **Code**: `plugins/chat-search/bin/ccsearch` — new `args.noTmux` parser entry; pass `process.env.TMUX || null` through `deps` (or pass the explicit `tmuxAvailable` boolean). `plugins/chat-search/bin/picker.js` — new Ctrl+W branch; new `spawnTmuxNewWindow(row, sessionStore)` helper that builds and runs the tmux command via `childProc.spawnSync("tmux", [...args], { stdio: "inherit" })`.
- **Tests**: `bin/ccsearch.test.sh` — assertions on `spawnTmuxNewWindow`'s arg-shape (via a CCSEARCH_TEST export of the builder function) for each name-resolution case.
- **Docs**: README — Ctrl+W entry; `--no-tmux` in flag reference; brief paragraph on the in-tmux workflow.
- **Users**: Zero impact outside tmux. Inside tmux: one-keystroke resume in a new window, named after the session.
- **Risk**: Low. The biggest landmine is escaping the `claude --resume <id>` command string for the shell wrapper that tmux runs — `<id>` is a UUID with hex digits and dashes, no shell-meta chars, so quoting is straightforward. We still shell-quote defensively (using the existing `shellQuote` helper in `bin/ccsearch:230` context).

## Dependencies

- Optionally benefits from `picker-rename-session`: when a row has a saved name, the tmux window inherits it. Without that change, Ctrl+W falls back to project name; the feature still works.
