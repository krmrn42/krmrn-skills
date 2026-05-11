## 1. BINDINGS table

- [ ] 1.1 In `bin/picker.js`, add a top-level `const BINDINGS = [...]` array with the entries from design.md §Decision 1. Place it near the top of the file (after the ANSI helpers, before `runPicker`).
- [ ] 1.2 Document the table with a one-paragraph comment: "Single source of truth for picker keybindings; the status bar renders from it, and a drift-guard test asserts onKeypress and BINDINGS stay in sync."

## 2. `buildStatusBar` helper

- [ ] 2.1 Add `function buildStatusBar(deps, cols) → string[]`. Returns 1 or 2 lines. Implementation follows design.md §Decision 3.
- [ ] 2.2 Add `function groupByCategory(visible) → { resume, action, dangerous, navigation }` preserving array order within each category.
- [ ] 2.3 Add `function formatBar(grouped, omit) → string` producing a single concatenated string with per-category colors.
- [ ] 2.4 Export `BINDINGS` and `buildStatusBar` via the `CCSEARCH_TEST` guard.

## 3. Render integration

- [ ] 3.1 Replace the existing single help-line write in `render` (currently `picker.js:271-279` post-prior-changes) with:
  ```js
  const statusLines = buildStatusBar(deps, cols);
  stdout.write(ansi.dim);
  for (let i = 0; i < statusLines.length; i++) {
    stdout.write(ansi.moveTo(2 + i, 1));
    stdout.write(statusLines[i]);
  }
  stdout.write(ansi.reset);
  ```
- [ ] 3.2 Adjust the body region start: `bodyTop = 4 + (statusLines.length - 1)` so a 2-line bar pushes the body down by one.
- [ ] 3.3 In the dangerous-resume change's `render` integration (now-deprecated yellow string), remove the inline yellow logic — it's superseded by the BINDINGS table's `category: "dangerous"`.

## 4. `?` help overlay

- [ ] 4.1 Add `let helpModeActive = false;` to the picker state.
- [ ] 4.2 In `onKeypress` (browse mode), add `if (str === "?" && !query.trim()) { helpModeActive = true; render(); return; }`. Note: only opens when query is empty so users can still type `?` as a literal character.
- [ ] 4.3 When `helpModeActive`, any next key (including printable, Esc, etc.) sets `helpModeActive = false` and returns early — no other action fires from that keystroke.
- [ ] 4.4 In `render`, branch on `helpModeActive`: clear the body region and render the BINDINGS table as a vertical list with one row per binding showing `<keys-padded-to-12-chars>  <longHelp>`. Keep the prompt and status bar visible.

## 5. Drift-guard test

- [ ] 5.1 Add `Test BINDINGS-vs-onKeypress`: extract keystroke patterns from `onKeypress` (grep for `key.ctrl && key.name === "X"`, `key.name === "Y"`, etc.) and assert each matches a BINDINGS entry's keys.
- [ ] 5.2 Extract keys from BINDINGS and assert each appears in `onKeypress` (catches phantom bindings the user can't actually invoke).

## 6. Unit tests for `buildStatusBar`

- [ ] 6.1 Single-line fit on a wide terminal: armed + tmux available + cols=200 → exactly 1 line, containing every binding.
- [ ] 6.2 Hidden bindings: armed=false → no Alt-Enter; tmuxAvailable=false → no Ctrl-W.
- [ ] 6.3 Two-line wrap at moderate width: cols=60 → 2 lines; navigation entries on line 2.
- [ ] 6.4 Tiny width (cols=39) → builder is not called (the existing `cols < 40` fallback in `render` runs first; verify the fallback path is unaffected).

## 7. Manual verification

- [ ] 7.1 🚧 NOT VERIFIED (requires real terminal): open the picker, confirm the status bar lists every visible binding with per-category colors.
- [ ] 7.2 🚧 NOT VERIFIED (requires real terminal): resize the terminal to ~60 cols, confirm the bar wraps to 2 lines.
- [ ] 7.3 🚧 NOT VERIFIED (requires real terminal): press `?`, confirm the help overlay shows long descriptions; press any key to dismiss.
- [ ] 7.4 🚧 NOT VERIFIED (requires real terminal): with `--dangerously-skip-permissions`, verify Alt-Enter entry appears in yellow.
- [ ] 7.5 🚧 NOT VERIFIED (requires real tmux): inside tmux, verify Ctrl-W entry appears in cyan; outside tmux, verify Ctrl-W entry is absent.

## 8. Docs

- [ ] 8.1 README: describe the status bar (per-category coloring, wrapping, `?` overlay) under the picker section.
- [ ] 8.2 `make lint-skills` → exit 0.
