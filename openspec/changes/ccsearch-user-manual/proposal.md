## Why

`ccsearch`'s spec material is scattered. The four older capabilities (the plugin itself, the slash command, the self-maintained index, the zero-deps/resume-handoff posture) live in the sibling marketplace at `/home/data/repos/github.com/krmrn42/skills/openspec/changes/archive/2026-05-10-*`. The four newer capabilities (cli-help, default-mode, recent-browse, dangerous-resume) live in `openspec/specs/` here. The six in-flight changes add another layer (rename, pin, remote-control, tmux, status-bar, this manual).

For a user — someone who installed the plugin or stumbled onto `ccsearch` from a colleague's terminal — none of that is approachable. The README (`plugins/chat-search/README.md`) is solid but is structured as a project overview, not a manual: it leads with "Why", "Install", "Architecture invariants", interleaved with reference tables. A user trying to learn `ccsearch` for the first time has to skim past contributor-oriented sections.

This change ships a dedicated **user manual** at `plugins/chat-search/MANUAL.md`: organized around what the user *does*, not how the code is shaped. Quick-start, then a workflow-oriented walkthrough of every feature, then a reference appendix. The two existing scattered-spec sources are folded together at the *feature description* level — users don't need to know which capability shipped in which marketplace; they need to know what Ctrl-R does.

## What Changes

- New file: **`plugins/chat-search/MANUAL.md`**. Structure:
  1. **Quick start** (5-line install + first-search workflow).
  2. **The picker** (the primary interactive surface): opening it, the layout (status bar / result list / preview pane), the empty-query recent-browse view, typing to filter (FTS5 syntax brief), keybindings table.
  3. **Picker actions in depth**: one short subsection per resume action (plain Enter, Alt-Enter dangerous, Ctrl-T remote-control, Ctrl-W tmux-window, Ctrl-F fork), each with: what it does, when to reach for it, what `claude` argv it produces, requirements (e.g., Ctrl-W needs `$TMUX`).
  4. **Mutation actions**: rename (Ctrl-R), pin (Ctrl-P), help overlay (`?`). What the config file is, where it lives, how to back it up.
  5. **One-shot mode**: when to use `--list` / `--format=text|tsv` / piped output; example pipelines.
  6. **The slash command**: `/chat-search:find` inside Claude Code, including the renderer's fixed flag set.
  7. **The index**: how it builds and refreshes, `--reindex`, `--index-status`, where the DB lives.
  8. **Flag reference** (compressed table, links to `--help`).
  9. **Troubleshooting**: common errors with their exit codes and remedies.
  10. **Compatibility notes** (Node version, terminals where Shift+Enter works, tmux quirks).
- The README's role is unchanged but it gains a single-paragraph "**Documentation:** see [MANUAL.md](./MANUAL.md) for the user-facing guide; this README is a project overview and contributor reference" near the top.
- The manual links **into** specific spec files for readers who want the formal definitions (`openspec/specs/ccsearch-recent-browse/spec.md`, etc.) but those links are appendix-style, not inline footnotes.
- The user-mentioned `../skills/` archives are referenced exactly once, in an "Origins" footer: "ccsearch's early capabilities were shaped in [krmrn42/skills](https://github.com/krmrn42/skills)'s OpenSpec archives at `openspec/changes/archive/2026-05-10-*`."

## Capabilities

### New Capabilities

- `ccsearch-user-manual`: Defines the structure, content scope, and update discipline for `plugins/chat-search/MANUAL.md`. The capability isn't a behavior — it's a documentation contract.

### Modified Capabilities

<!-- None — the manual references existing specs but doesn't change them. -->

## Impact

- **Code**: None. Pure docs.
- **New file**: `plugins/chat-search/MANUAL.md` (~600-900 lines, depending on examples).
- **Modified file**: `plugins/chat-search/README.md` — one-paragraph pointer near the top.
- **Tests**: None directly. (A "manual mentions every CLI flag" check would be nice but is over-investment for a docs file that turns over with features.)
- **Users**: A markdown manual they can read in their terminal (`less MANUAL.md`) or in GitHub.
- **Risk**: Low. The manual will become stale as features ship — that's an ongoing maintenance cost, not a one-time risk. The update discipline in the capability spec is that adding a new picker keybinding, flag, or behavior requires touching MANUAL.md in the same change.

## Dependencies

- This change should land **last** among the current batch (after rename, pin, remote-control, tmux, status-bar) so it can document features that are real instead of aspirational. Alternative: land it now with placeholders for the not-yet-implemented sections (clearly marked **🚧 Not yet implemented**), and fill them in as each parallel change merges. We'll go with the placeholder approach so the manual exists as a single asset that grows in lockstep.
