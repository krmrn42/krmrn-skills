# Changelog

All notable changes to the `chat-search` plugin are documented here.
The CLI shipped inside this plugin is also published to npm as
[`@krmrn42/multivac`](https://www.npmjs.com/package/@krmrn42/multivac); the
two carry the same version string.

## [0.8.1] — 2026-05-26

Project-grouped picker — chats are listed under their project, with an optional "Y more" footer. The previous two-section layout (working dirs ↑ chats ↓) is gone.

### Added
- **Project-grouped picker.** Projects (working directories that contain at least one chat) are the top-level entries. Each project's recent chats appear inline below its header, with a dim "Y more" footer when chats are elided.
  - Home mode (no query): up to 3 chats per project, ordered by recency.
  - Search mode, query hits the project name/path: padded to ≥3 chats (matches first, then most-recent).
  - Search mode, query does NOT hit the project name/path: only the chats whose content matched (could be empty → project hidden).
  - A project with zero shown chats is omitted entirely.
- **`N` keybinding — start a new chat in the row's project dir.** Works on chat rows (uses the chat's project) and on project header rows. `Enter` on a project header is also wired to "new chat here".
- **Project-header preview pane** — rounded box with path, chat count, branches touched, and a list of the 5 most-recent chats with their recap snippets.
- **`--list` output is project-grouped markdown** — one `##` heading per project, the project's chats listed under it as ordered items with embedded `(cd … && claude …)` resume one-liners. `(N more)` footer when chats are elided.
- **`--format=markdown`** as an explicit flag value; unknown formats still rejected.
- **No more phantom subdirectory "projects"** (spec §D15). Two mechanisms working together:
  - **`project_path` locking.** The parser locks every row's `project_path` to the **first** cwd-carrying record's `cwd`. Earlier versions stamped per-message cwd, so a single session that ran `cd packages/multivac && npm test` produced rows under `~/work/foo` AND `~/work/foo/packages/multivac` — manifesting as a phantom subdir "project". Now one JSONL, one project_path.
  - **Two filterable columns for non-user-initiated sessions.** Every row carries `is_subagent` (path-based: `1` if file lives under `subagents/`, a defensive future-proof) and `entrypoint` (raw value from the JSONL: `"cli"`, `"sdk-cli"`, or `NULL`). The picker queries filter `is_subagent = 0 AND (entrypoint IS NULL OR entrypoint = 'cli')`, so Claude Agent SDK launches (e.g., skill-creator scaffolding running in `~/.claude/plugins/cache/...`, one-off `/tmp/probe-*` test scripts) are excluded from the project list, recent-chat list, and FTS results. The rows remain in the index, so a future `--entrypoint=sdk-cli` flag can opt back in without re-indexing.
  - Schema bumps v3 → v4 → v5 (added `is_subagent` and `entrypoint` columns); each bump triggers a one-time drop-rebuild on first run after upgrade.

### Changed
- The two-section picker layout (working dirs section ↑ chats section ↓ with `── working dirs (n) ──` style dividers) is replaced by the project-grouped layout above.
- `ResultRow` gains a required `kind: "chat"` discriminator (additive — no consumer needs to be updated unless it constructs a ResultRow literal).
- New row kinds `ProjectHeader` (`kind: "project"`) and `MoreRow` (`kind: "more"`) join `ResultRow` in the discriminated `Selectable` union; the old `DirRow` and `SectionHeader` shapes are gone.
- The picker reducer now skips `more` rows on ↑/↓ and clamps the initial cursor to the first selectable row (`project` or `chat`).

### Out of scope (deferred to v0.8.2)
- Live process discovery / active threads inline under their project group (mapped to chat rows when possible, listed above when not).
- `r` refresh keybinding.
- Tmux pane correlation.
- `Ctrl-W` (tmux new-window) on project header rows.

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
