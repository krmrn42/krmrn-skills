## Context

`claude --remote-control [name]` is a built-in flag that starts a session with Remote Control enabled. It accepts an optional positional-style argument for the session name (consumed by Remote Control's session-naming UI). When the user has already named a session via `picker-rename-session`, that name should flow into the remote-control launch — exactly the kind of multi-feature integration where features pay off by composing.

The picker's spawn helper (`bin/picker.js:spawnClaude`) is already a 3-way switch over actions: `"fork"`, `"resume-dangerous"`, `"resume"`. This change adds a fourth: `"resume-remote-control"`.

## Goals / Non-Goals

**Goals:**

- Ctrl+T spawns `claude --remote-control [name] --resume <id>` in the row's project directory.
- When a saved name exists for the row, pass it as the remote-control argument.
- No CLI opt-in flag; the keybinding is always live.
- Composes cleanly with rename and pin (pinned + named row gets Ctrl+T → remote-control with that name).

**Non-Goals:**

- A `--dangerously-skip-permissions` overlay on the remote-control launch. If the user wants both, they can configure the remote-control session externally. Combining `--dangerously-skip-permissions` + `--remote-control` in one keystroke would burn another non-Enter keystroke and add real blast-radius; deferred until requested.
- Modifying `--remote-control` semantics — we're a thin shortcut for a flag that already exists.
- Detecting whether Remote Control is configured. The user must have done the upstream Remote Control setup; if they haven't, Claude Code's own error path handles it.
- An "exit picker with the command printed" mode for remote-control. Plain resume / fork emit no `resumeOneLiner` for the spawn; we follow the same direct-spawn pattern.

## Decisions

### Decision 1: Ctrl+T is the keystroke

Available, mnemonic ("Transmit"). Not used by any existing picker binding. Not commonly intercepted by terminal multiplexers in the default config (tmux's prefix is usually Ctrl+B; screen's is Ctrl+A).

**Alternative considered: Ctrl+R for "remote control".** Rejected — `Ctrl+R` is taken by `picker-rename-session`. Renaming is the higher-frequency action; keeping Ctrl+R for it is correct.

**Alternative considered: Alt+R.** Workable, but the picker's existing Alt+Enter establishes that Alt+ is the modifier we use for dangerous variants. Reusing Alt+ for a non-dangerous shortcut would muddy the meaning.

### Decision 2: Pass `--remote-control <name>` when a name exists, `--remote-control` alone otherwise

When the row has `sessions.json.names[<id>]`, the argv becomes `["--remote-control", "<name>", "--resume", "<id>"]`. When it doesn't, `["--remote-control", "--resume", "<id>"]` — Claude Code's `--remote-control-session-name-prefix` setting takes over.

**Critical detail**: we do NOT also pass `--name <name>` for remote-control launches. `--remote-control <name>` already consumes the name semantically; adding `--name` is redundant and might double-display. This is a deliberate departure from the `picker-rename-session` requirement "saved names propagate to all `claude` resume actions" — remote-control specifically consumes the name via its own arg.

### Decision 3: No opt-in flag

`--remote-control` doesn't have the blast-radius profile of `--dangerously-skip-permissions`. It's just "start a session that's remote-controllable" — opt-in upstream by virtue of having set up Remote Control at all. We don't add a `--allow-remote-control` CLI flag.

If a user has Remote Control unconfigured and hits Ctrl+T, the spawned `claude` exits with its own error. That's the right place for that diagnostic, not ccsearch.

### Decision 4: Extract argv construction into a pure helper

To make the argv unit-testable without spawning a real process, factor it into:

```js
function buildClaudeArgs(action, row, sessionStore) {
  // returns ["--remote-control", "<name>", "--resume", "<id>"] etc.
}
```

`spawnClaude` becomes a thin wrapper. Tests call `buildClaudeArgs` directly via the `CCSEARCH_TEST` export.

## Risks / Trade-offs

- **Risk: user hits Ctrl+T unintentionally** (e.g., reaching for Ctrl+G or Ctrl+Y nearby on QWERTY). → Mitigation: remote-control launches an interactive session same as plain Enter — the worst case is the user closes the new session. No data loss, no remote-side effect (Remote Control sessions need a controller to actually do anything).
- **Risk: `--remote-control` flag changes name or semantics upstream.** Mitigation: as with `--dangerously-skip-permissions`, we mirror the upstream flag name 1:1 so changes surface as upstream changes.
- **Trade-off: skipping `--name` for remote-control means renaming a session doesn't change its remote-control name unless it's launched with Ctrl+T after rename.** This is the intended interaction — renames update `sessions.json.names`, and remote-control reads that map at launch time.

## Open Questions

- Should there be a `Ctrl+Shift+T` (or similar) for "remote-control with `--dangerously-skip-permissions`"? Probably not — combined opt-ins should be rare. Defer until anyone asks.
