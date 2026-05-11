## Why

The picker currently has a single dim line on row 2: `Enter resume   Ctrl-F fork   Ctrl-O print id   Ctrl-D print path   Esc cancel` (with the yellow `Alt-Enter dangerous` entry conditionally inserted when the dangerous-resume capability is armed). After the parallel changes in flight — rename (Ctrl+R), pin (Ctrl+P), remote-control (Ctrl+T), tmux-new-window (Ctrl+W) — the bindings nearly double, and the single-line render either truncates several entries on narrow terminals or scrolls off the right edge. The dim-only treatment also fails the discoverability goal: a new user opening the picker has no clue what these less-common bindings do.

This change replaces the help line with a proper **status bar**: a one- or two-line region (depending on terminal width) at row 2 of the picker, structured by binding-category, with each binding rendered as `<key> <verb>` and styled per-category (resume actions in default color, mutation actions in cyan, dangerous in yellow). The status bar is generated from a single `BINDINGS` table that lives next to the keypress handlers — single source of truth, just like the OPTIONS table is for `--help`.

## What Changes

- **New BINDINGS table** in `bin/picker.js` listing every keybinding with: keys (e.g., `"Enter"`, `"Ctrl-F"`, `"Alt-Enter"`), category (`"resume"` | `"action"` | `"navigation"` | `"dangerous"`), short verb (e.g., `"resume"`, `"fork"`, `"rename"`), and a `visible(deps) → bool` predicate so context-dependent entries (Alt-Enter dangerous when armed; Ctrl-W only inside tmux) appear conditionally.
- **Status bar render**: pull all visible BINDINGS, group by category, format as `<key> <verb>` joined with two-space separators, render at the existing row 2 (replacing the current single-line help). Categories are concatenated in fixed order: `resume → action → dangerous → navigation`. If the total length exceeds the terminal width, split onto a second line (row 3) — pushing the body region one row down. Navigation bindings (arrows, Esc) MAY be omitted from the bar when terminal width is tight; they remain functional.
- **Per-category styling**: resume bindings in the picker's default color, action bindings (rename, pin, fork, remote-control, tmux-new-window) in cyan, dangerous bindings in yellow, navigation bindings in dim.
- **Move help line styling out of `render`** and into a `buildStatusBar(deps, cols) → string[]` helper that returns 1 or 2 lines, so the render function gets simpler and the status bar can be unit-tested (does the right key appear when armed; does it fit at narrow width).
- **A "?" line for full help**: pressing `?` (when query is empty) opens a transient overlay that lists every binding with a one-line description — for users who want the long form. Pressing any key dismisses it. (Tiny addition; cheap to wire because the BINDINGS table already has the descriptions.)
- The status bar is rendered **after** `picker-rename-session`, `picker-pin-sessions`, `picker-remote-control-launch`, and `picker-tmux-new-window` add their bindings, so it covers them all from day one. Land-order: this change should land last among the four picker-bindings changes (or all five land together).

## Capabilities

### New Capabilities

- `ccsearch-picker-status-bar`: Defines the BINDINGS table, the status-bar rendering rules (categories, ordering, styling, wrapping at narrow widths), the `?` overlay, and the visibility predicates for context-dependent bindings.

### Modified Capabilities

- `ccsearch-dangerous-resume`: The "Help line shows yellow danger entry when armed" requirement is subsumed into the new status-bar capability — the dangerous-resume entry now flows through the BINDINGS table's `visible: deps => deps.dangerouslySkipPermissions` predicate and the yellow styling comes from `category: "dangerous"`.

## Impact

- **Code**: `plugins/chat-search/bin/picker.js` — new BINDINGS const + `buildStatusBar` helper; `render` replaces the current help-line write with `for (const line of buildStatusBar(deps, cols)) write(line)`. New `?` overlay branch in `onKeypress`.
- **Tests**: Add unit tests for `buildStatusBar` covering each visibility predicate (armed vs not, inside vs outside tmux, etc.) and the narrow-width wrapping.
- **Docs**: README — update the picker section to describe the status bar and the `?` overlay. Help text — add a one-line note in the picker keybindings section that the status bar is the primary discoverability surface.
- **Users**: Visual change. Users get a richer, more legible binding list. The body region shrinks by 0–1 rows depending on whether the status bar wraps.
- **Risk**: Low. The most novel piece is the wrapping logic; we keep it dumb (single-pass measurement, two-line max) to avoid edge cases. Navigation entries are dropped first when width is tight.

## Dependencies

This change **requires** the other four picker-bindings changes to have landed (or to be implemented together as one batch), so the BINDINGS table is the right shape. If it lands first, the table simply has fewer entries and grows as each parallel change adds its own row.
