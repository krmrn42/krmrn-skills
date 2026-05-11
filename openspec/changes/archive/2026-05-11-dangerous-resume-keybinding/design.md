## Context

The picker spawns `claude` directly via `childProc.spawnSync("claude", claudeArgs, { stdio: "inherit", cwd })` in `bin/picker.js:388-391`. There is no shell-level intermediary — pressing Enter immediately starts a new Claude process with the selected session id. This shapes the safety design: any new keystroke that affects the spawn argv is a direct-execution path, not a print-and-paste one. We accept that surface but layer two opt-ins so accidental invocation is essentially impossible: a CLI flag (must be passed at startup) and a non-Enter keystroke (must be deliberately reached with Alt or Shift).

Node's readline `keypress` events expose modifier info as `key.meta` (Alt / Option) and `key.shift`. `meta` is reliable across virtually every terminal — Alt+Enter consistently arrives as `{ name: "return", meta: true }` regardless of terminal emulator. `shift` is **not** reliable: the majority of terminals (xterm, GNOME Terminal, macOS Terminal.app, default tmux, default screen) send a bare `\r` for both Enter and Shift+Enter, and Node has no way to distinguish them. Only terminals that support CSI-u (Kitty keyboard protocol, WezTerm's `enable_kitty_keyboard`, iTerm2 with the report-modifiers preference, Windows Terminal with enhanced keyboard) report Shift+Enter distinctly. The picker can wire both, but Shift+Enter is best-effort and must not become a hidden hazard on terminals that don't distinguish it.

## Goals / Non-Goals

**Goals:**

- The `--dangerously-skip-permissions` flag works as a clear, named opt-in that mirrors Claude Code's own flag.
- Alt+Enter on a picker row resumes with `--dangerously-skip-permissions` passed through to `claude`.
- Shift+Enter does the same on terminals that distinguish it; on terminals that don't, plain Enter remains safe (no silent injection of the flag).
- The picker's help line makes the armed state visible in yellow whenever the flag is set.
- Zero footprint when the flag is not set (no behavior change anywhere).

**Non-Goals:**

- Ctrl+Shift+F for "dangerous fork". Modifier detection on Ctrl+F is already tight (`key.ctrl && key.name === "f"`), and adding `key.shift` would either collide with terminal quirks or do nothing on most terminals. Out of scope; can be revisited if there's real demand.
- One-shot text output carrying the dangerous flag (e.g., `resumeOneLiner` learning to print `claude --dangerously-skip-permissions --resume <id>`). Text output is meant to be read and pasted; the user can append the flag themselves. Including it would also subtly normalize dangerous resume — we'd rather keep the affordance picker-only where the user can see the yellow help line.
- An in-picker confirmation prompt ("Press Y to confirm dangerous resume"). Adds friction for a workflow whose point is to remove friction; the two-layer opt-in already addresses the accident class.
- Replacing plain Enter's behavior when the flag is armed. Plain Enter is the safe path and must stay safe even after `--dangerously-skip-permissions` is on the command line.
- Persistent / config-file opt-in (e.g., `~/.config/ccsearch/config` with `dangerously_skip_permissions: true`). The flag-per-invocation requirement is part of the safety story.

## Decisions

### Decision 1: Two-layer opt-in (CLI flag + non-Enter keystroke)

The capability is **inert** unless `--dangerously-skip-permissions` is on `argv`. With the flag set, the picker keypress handler treats `(key.meta || key.shift) && key.name === "return"` as "dangerous resume" and dispatches to a new `spawnClaude("resume-dangerous", row)` path. Plain Enter (`key.name === "return"` without modifiers) keeps its existing safe behavior.

**Alternatives considered:**

- *Always-armed keystroke, no flag*. Simpler one-line implementation, but a user who hits Alt+Enter by accident — or worse, an alias that includes `--dangerously-skip-permissions` for one invocation that the user later forgets — would have no second check. Rejected.
- *Flag without keystroke (flag makes plain Enter dangerous)*. Replicates how Claude Code's own flag works at the top level. But here it's too implicit: `ccsearch --dangerously-skip-permissions` is plausible to set in an alias and then forget, and plain Enter is the muscle-memory key. Rejected.
- *Confirmation prompt in the picker*. Adds an extra keystroke at the moment of action, which fights the workflow. Two layers of *opt-in* (declared once at startup, expressed once at the keystroke) are equally safe and cheaper. Rejected.

### Decision 2: Modifier detection — `meta` reliable, `shift` best-effort

We bind both `(key.meta || key.shift) && key.name === "return"` to the dangerous action. The critical correctness property: on terminals that don't distinguish Shift+Enter, plain Enter arrives as `{ name: "return", shift: false, meta: false }`, which fails both modifier checks → falls through to the safe plain-Enter branch. We document explicitly that Shift+Enter is terminal-dependent so users who want a guaranteed binding use Alt+Enter.

We do **not** attempt to enable CSI-u / kitty keyboard protocol from the picker. Doing so requires sending `\x1b[>1u` on entry and `\x1b[<u` on exit, which is invasive (modifies the user's terminal state across the picker's altscreen boundary), platform-quirky, and not necessary — users who want Shift+Enter can configure their terminal to send the distinguishing sequence, which is a one-time, opt-in setup.

**Why this is safe even on quirky terminals**: the only failure modes possible are (a) Shift+Enter not triggering the dangerous action on a terminal that doesn't support CSI-u — annoying but safe, and (b) some unusual terminal reporting `key.shift = true` for plain Enter — would surprisingly invoke the dangerous action; we judge this exceedingly unlikely (none of the major terminals do this), but the CLI flag guard is the real safety net for this case.

### Decision 3: `spawnClaude` learns one new action, not two functions

`spawnClaude(action, row)` in `bin/picker.js:365-404` currently switches on `action === "fork"` to build the claude argv. We extend the same switch:

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

We do **not** OR the flag onto the existing resume branch. Keeping the dangerous argv as a distinct case makes the call site explicit and reviewable (you can grep for `"--dangerously-skip-permissions"` and see exactly where it can be passed).

**Alternative considered: a separate `spawnClaudeDangerous` function.** Rejected — duplicates the entire cwd-resolution and error-handling block for one differing argv line.

### Decision 4: One-shot is hands-off, on purpose

`runOneShot` and `resumeOneLiner` are not touched. A user passing `ccsearch --dangerously-skip-permissions --list "foo"` gets text output that does **not** include `--dangerously-skip-permissions` in the printed resume lines. The flag is silently ignored in this path.

**Why silent rather than an error?** Erroring on `--dangerously-skip-permissions` in one-shot would force users with shell aliases that include the flag (for picker use) to maintain two aliases. Silent acceptance plus a help-text note ("flag has no effect on one-shot output") is friendlier and equally safe.

**Why not pass it through?** Text output is read, then pasted, then executed. The pasting step is a moment of conscious attention where the user can append the flag themselves if they want it. Pre-baking it into copy-paste lines would be the subtlest hazard in the design — the user's eyes might skim the line.

### Decision 5: Help-line styling — single yellow entry, only when armed

The picker's existing help line (`bin/picker.js:271-279`) is dim and reads:

```
Enter resume   Ctrl-F fork   Ctrl-O print id   Ctrl-D print path   Esc cancel
```

When armed, prepend a yellow `Alt-Enter dangerous` entry between `Enter resume` and `Ctrl-F fork`:

```
Enter resume   <yellow>Alt-Enter dangerous</yellow>   Ctrl-F fork   Ctrl-O print id   Ctrl-D print path   Esc cancel
```

Yellow (`ansi.fgYellow`) is already in the picker's palette. Yellow rather than red because (a) red is harder to read on dark backgrounds where many terminals dim it, (b) red would imply "stop" which is wrong — the binding is allowed, just dangerous, and (c) yellow matches Claude Code's own warning convention.

When the flag is **not** armed, the help line is byte-for-byte unchanged (no entry, no extra spaces). The `cols < 40` "too small" fallback (`picker.js:252`) is untouched.

### Decision 6: Coordinate help-text edit with `improve-ccsearch-help`

The new flag needs an entry in `--help`. Two land orderings, both work:

- *`improve-ccsearch-help` lands first*: this change adds one OPTIONS-table row.
- *This change lands first*: this change adds one line to the current `buildHelp` string array; `improve-ccsearch-help` will pick it up during its restructure and the drift-guard test it ships will catch any omission.

The drift-guard test is the structural safety net: it greps `case "--…"` lines in `parseArgs` against the `--help` output and fails if any flag is missing from help. This change adds exactly one new case, so the test guarantees the help text covers it.

## Risks / Trade-offs

- **Risk: a user sets the flag in a shell alias and forgets.** → Mitigation: every picker render shows the yellow `Alt-Enter dangerous` entry. The user sees it on every invocation, not just the first.
- **Risk: an exotic terminal reports `key.shift = true` for plain Enter.** → Mitigation: the CLI flag is required regardless; without it, the binding is inert. The realistic failure mode is "user pressed Enter, expected safe resume, got dangerous resume" — only possible if both the flag is set *and* the terminal misreports shift. We accept the risk as theoretical given how widespread the `\r`-for-Enter behavior is.
- **Risk: Alt+Enter is bound by tmux / screen / terminal multiplexer to something else.** → Mitigation: Alt+Enter is rarely intercepted by multiplexers (it's not a standard binding for tmux/screen). If a user's setup intercepts it, they can configure their tmux/screen to pass through `\x1b\r`, or they can fall back to typing the resume command manually. We don't try to detect interception.
- **Risk: confusion when the user runs `ccsearch --dangerously-skip-permissions` without arming the picker** (e.g., piping to head). → Mitigation: the flag silently no-ops in one-shot mode (Decision 4). The `--help` entry calls this out so a user reading help won't expect text-output behavior.
- **Trade-off: discoverability is limited** — the binding is only visible to users who run `ccsearch --help` and see the flag, or who pass the flag once and see the yellow help line. We accept this. Hidden discoverability is preferable to default discoverability for a high-blast-radius affordance.

## Migration Plan

No migration. Pure additive change. Rollback is a single-file revert of `bin/ccsearch` (parser branch) and `bin/picker.js` (keypress branch + help-line edit). No state on disk, no schema changes.

## Open Questions

- Should `Ctrl-Shift-F` / some other key be added later for "dangerous fork"? Defer until users ask. The two-layer opt-in pattern extends cleanly when we do.
- Should the dangerous resume action also short-circuit any unsaved query draft (e.g., does `Alt+Enter` care about whatever text is in the query box)? Answer is **no — same as plain Enter**: the query state is irrelevant once the action is dispatched; we resume the selected row regardless of what's in the query buffer. This is the existing semantics for plain Enter and we preserve it.
