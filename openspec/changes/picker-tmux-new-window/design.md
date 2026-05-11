## Context

`tmux new-window` is the standard mechanism for spawning a sibling tmux window from a running session. Inside tmux, the `$TMUX` env var is set to something like `/tmp/tmux-1000/default,12345,0` (socket path + pid + session id) — this is the canonical "am I in tmux?" check used by tmux-aware tools.

The picker already runs `childProc.spawnSync` for the resume flow (`bin/picker.js:spawnClaude`). Spawning `tmux new-window` is similar in shape: synchronous spawn, the result is just "did the new window get created" rather than "did the child process exit cleanly with a meaningful code". `tmux new-window` exits immediately after creating the window — the user's view returns to wherever they were.

## Goals / Non-Goals

**Goals:**

- Inside tmux, Ctrl+W on a picker row creates a new tmux window running `claude --resume <id>` in the row's project directory.
- New window's name is the row's saved name (if any), else the project name. Truncated for tab-bar readability.
- Picker tears down cleanly after invoking tmux. The user is back to their pre-picker view, with a new tmux window in the background.
- Outside tmux, the binding is invisible (not in status bar) and a no-op with diagnostic stderr if pressed somehow.

**Non-Goals:**

- Splitting the current pane (`tmux split-window`). New-window is the more common workflow; split-window is the user's call after the fact (`prefix , split-pane` etc.).
- Detached/popup windows. `tmux new-window -d` works; we use the default which puts the window in the session but doesn't switch to it — this preserves the user's current focus exactly.
- Switching focus to the new window automatically. The default `new-window` switches focus; we pass `-d` to keep the user where they were. Trade-off: if the user wants to *go to* the new window, that's `prefix n` after the fact (one keystroke), which is fine.

  Actually, on reflection: the natural user expectation is "I want to resume that conversation now" — switching focus is probably what they want. We'll go without `-d` (focus switches to the new window). If users complain, `-d` is a one-flag change. Decision recorded in §Decision 2.

- Detecting tmux servers running on different sockets. `$TMUX` is the canonical check; we don't try harder.

## Decisions

### Decision 1: Detect tmux once at startup via `process.env.TMUX`

In `main()` (or wherever `deps` is constructed for `runPicker`), set `tmuxAvailable = !!process.env.TMUX && !args.noTmux`. Pass through `deps`. The picker uses this to gate the Ctrl+W keybinding and to decide whether the help line shows the entry.

We don't re-check at keystroke time. If the user's tmux server dies between picker open and Ctrl+W, the `tmux new-window` invocation errors and we print the stderr. That's a rare edge case worth letting fail loudly.

### Decision 2: `tmux new-window` switches focus (no `-d`)

The natural user intent for "open this conversation in a new tmux window" is "I want to go to that window now". `new-window` without `-d` switches focus to the new window. The user's prior pane is untouched and accessible via `prefix p` or `prefix <number>`.

If the user wanted to *stay* in their current pane, they'd use plain Enter (which currently replaces the pane). Ctrl+W vs Enter is the "stay where I am" vs "go somewhere new" distinction.

### Decision 3: Window-name resolution

```
saved-name (from sessions.json.names)
  ↓ if absent
projectName (the conversation's project, e.g. "alpha")
  ↓ if absent or empty
basename(projectPath)
  ↓ if also absent
"claude"  (final fallback — should never happen but be defensive)
```

Truncated to 40 chars (tmux's default tab-bar slot is usually ~20-30 chars wide; 40 leaves room without making names useless). Trailing `…` on truncated names.

We strip control characters from the name before passing to tmux. Saved names are user-typed strings — we don't trust them to be tmux-safe. Allowed chars: printable ASCII + non-control Unicode. (`/[\x00-\x1f\x7f]/g` → empty.)

### Decision 4: Builder function is pure and unit-testable

Extract `buildTmuxNewWindowCommand(row, opts)` from the spawn helper:

```js
function buildTmuxNewWindowCommand(row, { savedName, isExistingDir }) {
  // returns ["new-window", "-n", "<name>", "-c", "<cwd>", "<shell-command>"]
}
```

The shell-command piece is the inner invocation: `claude --resume <session-id>` (plus `--name <name>` if there's a saved name — same as plain resume). We pass the inner command as the last positional arg to `tmux new-window`; tmux runs it via `$SHELL -c`.

We deliberately do NOT shell-escape the inner command via `shellQuote` — tmux's `-c` handler does the right thing for the args it receives. The session id is UUID-shaped (hex + dashes), the name is sanitized; no shell injection vectors.

### Decision 5: `--no-tmux` is the kill switch

If a user's setup breaks `tmux new-window` (nested tmux, screen-inside-tmux, IDE-embedded terminal that masquerades as tmux), `--no-tmux` disables the binding. Documented in `--help`.

## Risks / Trade-offs

- **Risk: nested tmux** (user runs tmux inside tmux). `$TMUX` is still set; `tmux new-window` operates on the outermost tmux. Generally correct, but could surprise users with multiple tmux sessions running. `--no-tmux` is the escape hatch.
- **Risk: tmux server not running** despite `$TMUX` being set (rare — implies stale env from a killed tmux). `tmux new-window` errors; we print the stderr and the picker exits with the tmux exit code. User can rerun `ccsearch` after restarting tmux.
- **Risk: window name with special chars** (saved name like `feat/x #123`). We strip control chars but pass other characters through. tmux is generally robust to slashes, hash, parens in window names.
- **Trade-off: switching focus to the new window.** Some users will want to stay in their current pane. The `-d` toggle is documented as a follow-up; for now we ship the more natural behavior.

## Open Questions

- Should there be a `Ctrl+Shift+W` (or similar) for "split current pane instead of new window"? Defer until users ask. The picker already has Ctrl+W → new-window; if a second mode emerges as a clear pattern, we'll add it.
- Should focused-or-detached be configurable via `--tmux-detached` flag? Possibly — but adding a knob is more weight than the feature currently warrants. Defer.
