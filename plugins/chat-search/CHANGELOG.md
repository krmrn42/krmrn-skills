# Changelog

All notable changes to the `chat-search` plugin are documented here.
The CLI shipped inside this plugin is also published to npm as
[`@krmrn42/multivac`](https://www.npmjs.com/package/@krmrn42/multivac); the
two carry the same version string.

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
