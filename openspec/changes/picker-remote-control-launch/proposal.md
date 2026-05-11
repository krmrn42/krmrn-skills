## Why

`claude --remote-control [name]` ("Start an interactive session with Remote Control enabled (optionally named)") is the official upstream way to launch a Claude Code session that can be driven by an external controller. For users who routinely run sessions with remote control on — long-running tasks, multi-machine workflows, "Claude in Chrome" integration — the picker today has no shortcut for it. Resume + remote-control means typing the command by hand.

This change adds a picker keybinding that spawns the selected row's session with `--remote-control` (passing the session's saved name from `picker-rename-session` when one exists). It mirrors the shape of `picker-tmux-new-window` and `Alt+Enter dangerous resume` — one keystroke, one well-named launch.

**Naming note**: the user described this as `--remote`, but the actual Claude Code flag is `--remote-control` (per `claude --help`). This proposal uses the real flag throughout.

## What Changes

- New picker keybinding **Ctrl+T** ("transmit" — `T` chosen because `R` is taken by rename and `M` doesn't read as remote): on a selected row, spawn `claude --remote-control [<name>] --resume <id>` in the row's project directory.
- When the row has a saved name in `sessions.json`, pass it as the `--remote-control` argument (`--remote-control "<name>"`). When it doesn't, omit the optional argument — the user's `--remote-control-session-name-prefix` setting (defaults to hostname) takes effect.
- The capability is **always available** when the picker is open — no CLI flag required to arm it. Unlike `--dangerously-skip-permissions`, remote-control is a per-invocation behavior with no blast radius beyond the spawned session; it doesn't deserve the two-layer opt-in. (If the user disagrees, an opt-in flag is a trivial follow-up.)
- The picker's spawn logic gains a new `"resume-remote-control"` action wired through the same `spawnClaude` switch that already routes `"resume"`, `"resume-dangerous"`, and `"fork"`.
- Help-text and `--help` mention the keybinding under a new `Picker actions:` section.

## Capabilities

### New Capabilities

- `ccsearch-remote-control-resume`: Defines the Ctrl+T keybinding, the spawned argv shape (including the optional `--remote-control <name>` arg when a name is saved), and the (existing) cwd-resolution logic that resume actions share.

### Modified Capabilities

<!-- None — `ccsearch-session-rename`'s "saved names propagate to all `claude` resume actions" requirement already names the future remote-control action as a target, so no additional spec changes there. -->

## Impact

- **Code**: `plugins/chat-search/bin/picker.js` — new Ctrl+T branch in `onKeypress` calling `finish("resume-remote-control")`; new branch in `handleAction` calling `spawnClaude("resume-remote-control", row)`; new branch in `spawnClaude` constructing `["--remote-control" [, "<name>"], "--resume", row.sessionId]`. The `--name` passthrough from `picker-rename-session` is **not** added on top of `--remote-control <name>` — when remote-control consumes the name as its own arg, `--name` would be redundant; we omit `--name` for remote-control launches specifically.
- **Tests**: `bin/ccsearch.test.sh` — assert the argv shape for a node-level unit test of `spawnClaude`'s arg-construction (extract that subset into a pure helper so it's unit-testable without spawning).
- **Docs**: README — Ctrl+T entry in keybindings; describe the name-passthrough behavior. Help text — new entry in the picker actions section.
- **Users**: Zero impact until Ctrl+T is pressed. After that, `claude --remote-control [name] --resume <id>` opens, behaving exactly as if the user had typed that command manually.
- **Risk**: Low. Remote-control is a standard Claude Code feature; we're just shortcutting an invocation.

## Dependencies

- Optionally benefits from `picker-rename-session` (uses saved names as the remote-control name argument). Without it, Ctrl+T still works — it just passes `--remote-control` with no name and lets Claude Code's name-prefix setting fill in.
