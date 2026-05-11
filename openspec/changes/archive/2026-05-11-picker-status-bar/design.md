## Context

The picker's current help line is a hardcoded string:

```
Enter resume   Ctrl-F fork   Ctrl-O print id   Ctrl-D print path   Esc cancel
```

…with a yellow `Alt-Enter dangerous` entry conditionally inserted when armed. It works because there are only six bindings. After the parallel changes, the binding count roughly doubles. A hardcoded string becomes harder to keep aligned with the keypress handlers (the same drift class that motivated `improve-ccsearch-help`'s drift-guard test), and the visual treatment doesn't scale to a longer list.

A table-driven status bar is the standard fix: each binding declares itself (keys, label, visibility), the renderer iterates and formats. This is the picker analog of the OPTIONS table we built for `--help` — same pattern, same testability properties.

## Goals / Non-Goals

**Goals:**

- Every picker keybinding is listed in the status bar (subject to visibility predicates).
- Per-category styling makes it scannable: resume / action / dangerous / navigation.
- Single source of truth that the keypress handler and the status bar share — adding a new binding means adding one row to the BINDINGS table.
- Status bar wraps to 2 lines on narrow terminals; navigation entries drop first.
- A `?` key opens a transient overlay with the long-form descriptions.

**Non-Goals:**

- A configurable color theme. Picker styling is hardcoded today and that's fine.
- A configurable bindings layout. We commit to one order (resume → action → dangerous → navigation); users who want different won't get a setting.
- A persistent help mode. The `?` overlay is dismissed on any key.
- Mouse support / clickable entries. Picker remains keyboard-driven.

## Decisions

### Decision 1: BINDINGS table shape

```js
const BINDINGS = [
  {
    keys: ["Enter"],
    label: "resume",
    category: "resume",
    visible: (deps) => true,
    longHelp: "Spawn `claude --resume <session-id>` in the row's project directory.",
  },
  {
    keys: ["Alt-Enter", "Shift-Enter"],
    label: "dangerous",
    category: "dangerous",
    visible: (deps) => !!deps.dangerouslySkipPermissions,
    longHelp: "Spawn `claude --dangerously-skip-permissions --resume <id>` — skips all permission prompts.",
  },
  {
    keys: ["Ctrl-T"],
    label: "remote-control",
    category: "action",
    visible: (deps) => true,
    longHelp: "Spawn `claude --remote-control [name] --resume <id>` for the selected row.",
  },
  {
    keys: ["Ctrl-W"],
    label: "tmux window",
    category: "action",
    visible: (deps) => !!deps.tmuxAvailable,
    longHelp: "Open the resumed session in a new tmux window named after the conversation.",
  },
  {
    keys: ["Ctrl-R"],
    label: "rename",
    category: "action",
    visible: (deps) => true,
    longHelp: "Rename the selected conversation. Saved in ~/.config/krmrn42-skills/chat-search/sessions.json.",
  },
  {
    keys: ["Ctrl-P"],
    label: "pin",
    category: "action",
    visible: (deps) => true,
    longHelp: "Pin/unpin the selected conversation to the top of the picker list.",
  },
  {
    keys: ["Ctrl-F"],
    label: "fork",
    category: "action",
    visible: (deps) => true,
    longHelp: "Spawn `claude --fork-session --resume <id>` to create a new session id from this one.",
  },
  {
    keys: ["Ctrl-O"],
    label: "print id",
    category: "action",
    visible: (deps) => true,
    longHelp: "Print the row's session id to stdout and exit. Useful for piping.",
  },
  {
    keys: ["Ctrl-D"],
    label: "print path",
    category: "action",
    visible: (deps) => true,
    longHelp: "Print the row's project path to stdout and exit.",
  },
  {
    keys: ["↑/↓"],
    label: "nav",
    category: "navigation",
    visible: (deps) => true,
    longHelp: "Move cursor up/down (also Ctrl-K / Ctrl-J).",
  },
  {
    keys: ["Esc"],
    label: "cancel",
    category: "navigation",
    visible: (deps) => true,
    longHelp: "Cancel the picker (exit 0 without resuming).",
  },
  {
    keys: ["?"],
    label: "help",
    category: "navigation",
    visible: (deps) => true,
    longHelp: "Toggle this binding reference overlay.",
  },
];
```

The order in the array is the order in the status bar (grouped by category). Adding a new binding = appending one row.

### Decision 2: Render format

Each binding renders as `<keys-joined-with-/>` + space + `<label>`. Two-space separator between bindings within a category. Three-space separator between categories. Multiple keys (e.g., `"Alt-Enter"`, `"Shift-Enter"`) join with `/` so the user sees both.

Per-category coloring uses the picker's existing ANSI palette:

| Category | Color | Reasoning |
|---|---|---|
| `resume` | default (no color) | Primary action — high prominence by default |
| `action` | cyan (`ansi.fgCyan`) | Distinct from resume but not warning-colored |
| `dangerous` | yellow (`ansi.fgYellow`) | Existing convention from dangerous-resume |
| `navigation` | dim | De-emphasized; functional always-available |

We DON'T color the keys vs. labels differently — the per-category color covers both. Inside the dim wrapper for the whole line, each category's color is opened, closed at the category boundary.

### Decision 3: Wrapping logic — measure, then decide

```js
function buildStatusBar(deps, cols) {
  const visible = BINDINGS.filter((b) => b.visible(deps));
  const grouped = groupByCategory(visible);  // preserves array order
  const oneLineText = formatBar(grouped, /*omit:*/ []);
  if (visibleLen(oneLineText) <= cols) return [oneLineText];

  // Try dropping navigation first
  const noNav = formatBar(grouped, /*omit:*/ ["navigation"]);
  if (visibleLen(noNav) <= cols) return [noNav, formatNavLine(grouped.navigation)];

  // Still too wide → two lines, split at category boundaries
  return splitAtCategoryBoundary(grouped, cols);
}
```

`splitAtCategoryBoundary` finds the smallest prefix of categories that fits in `cols`, puts the rest on line 2. Worst case (terminal < 40 cols): a single line that truncates with `…` from `truncateToWidth`. The picker's existing `cols < 40` "terminal too small" fallback (`picker.js:252`) catches the truly degenerate case.

### Decision 4: `?` overlay is one-shot

When the user presses `?` (and the rename-input mode is NOT active), the picker enters a `help` mode: an alt-screen overlay (`ansi.altScreenEnter` is already in use; we layer with a different cleared region) listing every BINDINGS row with its `longHelp` description. Any key press exits help mode and returns to the picker.

We re-use the picker's main screen; the body region becomes the help text, the result list is hidden temporarily. This is the simplest implementation; popup-style overlays would be more polished but more complex.

### Decision 5: BINDINGS export for testing

Export `BINDINGS` and `buildStatusBar` via `module.exports` only when `CCSEARCH_TEST=1` (consistent with the pattern established by earlier changes). Tests then:

- Assert the table has entries for every keypress handler in `onKeypress` (drift guard — same pattern as `improve-ccsearch-help`'s parser-vs-help test).
- Assert `buildStatusBar(deps={dangerouslySkipPermissions:true}, cols=120)` includes `"Alt-Enter"` and not when armed=false.
- Assert narrow-width wrapping produces 1 or 2 lines depending on category set.

## Risks / Trade-offs

- **Risk: 2-line status bar shrinks the body region.** Acceptable — the alternative (truncating bindings) is worse. We can revisit if real users complain about lost rows; one mitigation would be a `--compact-status` flag that forces single-line + truncate.
- **Risk: BINDINGS drift from `onKeypress`.** Mitigation: a test that scans `onKeypress` for keystrokes and asserts each matches a BINDINGS entry. (Parser-vs-help test's spiritual analog.)
- **Trade-off: per-category colors hardcoded.** A theme system would be over-built. If users want different colors, they can fork.
- **Risk: `?` overlay clears the result list.** Acceptable; the user re-summons the picker on next render. Saved cursor position is preserved across the help mode.

## Open Questions

- Should the status bar be on row 2 (current position) or row `rows-1` (bottom)? Bottom is more conventional for "status bar" (vi, tmux's own). But moving it forces the body region to anchor differently and breaks the existing prompt-on-row-1 / help-on-row-2 contract. Defer: keep on row 2 for this change. A future tweak can move it if there's demand.
