# Changelog

All notable changes to the `chat-search` plugin are documented here.
The CLI shipped inside this plugin is also published to npm as
[`@krmrn42/multivac`](https://www.npmjs.com/package/@krmrn42/multivac); the
two carry the same version string.

## [0.8.0] — 2026-05-24

### Added

- Schema v3 migration adds three nullable columns: `subtype`, `git_branch`, `attribution_skill`. Triggers a one-time full reindex.
- Parser indexes `type=system, subtype=away_summary` rows — Claude Code's "away" recap content, surfaced as the chat preview when fresh.
- Per-message `gitBranch` and `attributionSkill` extracted from JSONL and stored on each row.
- New helper `getRecapText()` resolves the best-available recap for a conversation: fresh away_summary first, falling back to the head of the most recent assistant message.

### Changed

- TUI chat row layout is now 3 lines (header / metadata strip / recap-or-snippet) instead of 2 lines. The metadata strip surfaces `(branch) · skill` when present.
- `PreviewPane` and one-shot `--preview` output use rounded box borders (`╭─╮ ╰─╯`), degrading to ASCII (`+---+`) when `--no-color` is set.
- Layout dimensioning: `rowsPerResult` bumps from 2 → 3.

### Compatibility

- All v0.7 keybindings preserved.
- Existing one-shot output (`--format=text`, `--format=tsv`) unchanged in shape.
- Sessions config (`sessions.json`) schema unchanged.

### Spec

[docs/superpowers/specs/2026-05-24-multivac-dashboard-design.md](https://github.com/krmrn42/krmrn-skills/blob/main/docs/superpowers/specs/2026-05-24-multivac-dashboard-design.md) (D2, D3, D6, D7, D11).

## [0.6.0] — 2026-05-21

### Renamed (BREAKING)

- **`ccsearch` → `multivac`**. The on-PATH binary is now `multivac`. Users who
  previously ran `/chat-search:setup` will find `~/.local/bin/ccsearch` dangling
  — re-run `/chat-search:setup` and it will (a) clean up the stale symlink (only
  when it points into this plugin's `bin/`) and (b) create `~/.local/bin/multivac`
  in its place. The plugin's manifest, slash command names, and flag surface are
  unchanged.
- **`$CCSEARCH_DB` → `$MULTIVAC_DB`**. If you had `export CCSEARCH_DB=...` in
  your shell-rc to override the FTS5 index path, rename it to `MULTIVAC_DB`. The
  CLI no longer reads the old name.

### Added

- **npm distribution**. The same CLI is now installable as
  `npm install -g @krmrn42/multivac`, runnable without install via
  `npx -y @krmrn42/multivac`, and bundled with a new `multivac init` subcommand
  that drives `claude plugin marketplace add krmrn42/krmrn-skills` and
  `claude plugin install chat-search@krmrn-skills` (note: the `plugin`
  subcommand of the `claude` CLI — NOT the `/plugin` REPL slash command, which
  isn't available in non-interactive argv contexts). If `claude` is not on
  `$PATH`, `multivac init` instead prints the equivalent slash commands for you
  to paste inside an interactive Claude Code session.
- **`multivac --version`**. Prints the package version (from `package.json`) and
  exits 0.
- **`multivac -- init`**. POSIX end-of-options sentinel — use this form to
  search for the literal word "init", since `init` is now a reserved subcommand.

### Changed (internal)

- The canonical sources for the CLI now live at `packages/multivac/src/` in the
  monorepo. The plugin's `bin/multivac`, `bin/indexer.js`, and `bin/picker.js`
  are git-tracked symlinks into that directory. Editing the canonical sources
  is the only place a change is needed.

## Earlier versions

Pre-0.6.0 history is in the git log; this CHANGELOG starts with the rename
to `multivac` because that is the first user-visible breaking change since
the plugin's introduction.
