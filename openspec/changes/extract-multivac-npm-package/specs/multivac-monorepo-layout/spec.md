## ADDED Requirements

### Requirement: Canonical sources live under `packages/multivac/`

The CLI's authoritative JavaScript sources SHALL reside under `packages/multivac/src/`. The repository's `packages/multivac/` directory MUST contain at minimum: `package.json`, `README.md`, `LICENSE`, `NAMING.md` (the relocated naming decision record), and `src/` (sources). The directory MUST be self-contained — it MUST be installable from this directory in isolation via `npm pack` + `npm install ./<tarball>`.

#### Scenario: Required files present at the package root

- **WHEN** a developer inspects `packages/multivac/`
- **THEN** `package.json`, `README.md`, `LICENSE`, `NAMING.md`, and `src/` all exist
- **AND** `package.json` `name` is `@krmrn42/multivac`

#### Scenario: Package is installable in isolation

- **WHEN** a developer runs `cd packages/multivac && npm pack` and then `npm install -g ./krmrn42-multivac-*.tgz` in a clean workspace
- **THEN** the install succeeds without network access for any transitive deps
- **AND** `multivac --version` works on the resulting global install

#### Scenario: NAMING.md is at the package root, not buried

- **WHEN** a developer browses the repo on GitHub
- **THEN** `packages/multivac/NAMING.md` is the canonical home of the rename decision record
- **AND** any `plugins/chat-search/NAMING.md` that remains is a one-line stub pointing at the new location (or has been deleted entirely)

### Requirement: Plugin is a thin shim over the package

The `plugins/chat-search/` directory SHALL continue to provide the Claude Code plugin surface (manifest, slash commands, MANUAL.md), but its `bin/` directory MUST NOT contain duplicate copies of the CLI sources. The plugin's `bin/` MUST contain exactly the symlinks needed to expose the renamed CLI: `plugins/chat-search/bin/multivac`, `plugins/chat-search/bin/indexer.js`, `plugins/chat-search/bin/picker.js`, and the test script (if it remains in `bin/`). Each symlink resolves into `packages/multivac/src/`. Editing the canonical source under `packages/multivac/src/` MUST be the only place a change is needed to update the CLI's behavior.

#### Scenario: Plugin bin/ contents resolve to packages/multivac/

- **WHEN** a developer runs `realpath plugins/chat-search/bin/multivac`
- **THEN** the resolved path is `packages/multivac/src/multivac.js`

#### Scenario: Plugin's bin/ has no `ccsearch` entry

- **WHEN** a developer lists `plugins/chat-search/bin/`
- **THEN** no file or symlink named `ccsearch` exists in that directory

#### Scenario: Plugin still works in-place via /plugin install

- **WHEN** a user runs `/plugin install chat-search@krmrn-skills` from a Claude Code session
- **THEN** the installed plugin's `bin/multivac` is executable
- **AND** invoking it via the slash command `/chat-search:find <query>` produces a search result with no missing-file errors

#### Scenario: No source duplication

- **WHEN** static analysis compares file contents of `plugins/chat-search/bin/` with `packages/multivac/src/`
- **THEN** for every file present in both, either the plugin file is a symlink to the package file, or the file content is byte-identical and produced from the package by a documented build step

### Requirement: Slash commands invoke `multivac`, not `ccsearch`

Both slash commands defined under `plugins/chat-search/commands/` SHALL invoke the CLI by the name `multivac`. No occurrence of the word `ccsearch` as a binary name SHALL remain in the slash-command prose, code blocks, or example outputs. The slash commands MAY mention the historical name `ccsearch` only in the context of explaining the rename (e.g., a one-line note in `setup.md` saying "If you previously installed `ccsearch` via this command, the stale symlink is removed").

#### Scenario: find.md uses multivac everywhere

- **WHEN** a developer runs `grep -n ccsearch plugins/chat-search/commands/find.md`
- **THEN** the result is either empty or only matches a historical-rename note (not an active invocation)

#### Scenario: setup.md uses multivac everywhere

- **WHEN** a developer runs `grep -n ccsearch plugins/chat-search/commands/setup.md`
- **THEN** the result either is empty or only matches a historical-rename note and the cleanup-step description

### Requirement: `/chat-search:setup` cleans up the stale `ccsearch` symlink

The `/chat-search:setup` slash command SHALL detect a pre-existing `<target-dir>/ccsearch` symlink whose readlink resolves into `plugins/chat-search/bin/` (i.e., a symlink it previously created during a prior install) and remove it before — or as part of — symlinking the new `multivac`. A `ccsearch` file that is NOT a symlink, or a symlink that resolves elsewhere, MUST be left untouched and surfaced to the user in the command's output.

#### Scenario: Stale plugin-owned ccsearch symlink is removed

- **WHEN** a user has `~/.local/bin/ccsearch` as a symlink whose target is under `plugins/chat-search/bin/` (left over from a prior version of the plugin)
- **AND** the user runs `/chat-search:setup`
- **THEN** the slash command's emitted bash removes the stale `~/.local/bin/ccsearch` symlink
- **AND** creates `~/.local/bin/multivac` as a symlink to `${CLAUDE_PLUGIN_ROOT}/bin/multivac`
- **AND** the human-readable output explicitly notes the cleanup ("removed stale `ccsearch` symlink from prior install")

#### Scenario: Unrelated ccsearch file is preserved

- **WHEN** a user has `~/.local/bin/ccsearch` as a regular file or a symlink resolving to a path outside `plugins/chat-search/bin/`
- **AND** the user runs `/chat-search:setup`
- **THEN** the slash command does NOT delete or overwrite `~/.local/bin/ccsearch`
- **AND** the output advises the user to remove it manually if it is no longer needed

### Requirement: Version-sync is a single point of edit with lint enforcement

A release of the `multivac` npm package and a release of the `chat-search` marketplace plugin SHALL share a single version string. The version MUST appear in three files: `packages/multivac/package.json`, `plugins/chat-search/.claude-plugin/plugin.json`, and the matching entry in `.claude-plugin/marketplace.json`. Any divergence SHALL be reported by the marketplace lint (`make lint-skills` or equivalent) as a hard error.

#### Scenario: Lint detects skew

- **WHEN** a developer changes only `packages/multivac/package.json` `version` from `0.6.0` to `0.7.0` (leaving the other two at `0.6.0`) and runs `make lint-skills`
- **THEN** lint exits non-zero
- **AND** the error message names all three files and their current version values

#### Scenario: Lint passes when versions agree

- **WHEN** all three files carry the same version string
- **THEN** `make lint-skills` exits 0 with respect to the version-sync check

### Requirement: Plugin manifest and marketplace metadata remain canonical for plugin distribution

The `plugin.json` and `marketplace.json` files SHALL continue to be the source of truth for what the Claude Code plugin system reads. The npm package MUST NOT redefine plugin manifest schema, nor ship a competing `marketplace.json`. The plugin's `description` paragraph SHALL be updated to (a) say `multivac` instead of `ccsearch` where the binary name is referenced and (b) note that the same CLI is also installable via `npm install -g @krmrn42/multivac`, all within the existing length cap enforced by `skill-linting`.

#### Scenario: No second marketplace.json under packages/

- **WHEN** a developer searches the tree with `find packages -name marketplace.json`
- **THEN** no result is returned

#### Scenario: plugin.json references multivac and the npm package

- **WHEN** inspecting `plugins/chat-search/.claude-plugin/plugin.json`
- **THEN** the `description` paragraph uses `multivac` (not `ccsearch`) when naming the binary
- **AND** the paragraph references the npm install path (`@krmrn42/multivac` or `npm install -g`)
- **AND** the paragraph remains within the length cap enforced by `skill-linting`

### Requirement: Tests live with sources, not in the published tarball

The CLI's existing test script (formerly `ccsearch.test.sh`) SHALL move to `packages/multivac/test/multivac.test.sh` (or remain under `src/` next to the sources — see design.md), but MUST NOT ship in the published npm tarball. The `files` allowlist in `package.json` is the enforcement mechanism.

#### Scenario: Test script absent from publish

- **WHEN** a developer runs `npm pack --dry-run` inside `packages/multivac/`
- **THEN** the list of files to be packed does NOT include any path matching `**/*.test.sh` or `test/**`

#### Scenario: Test script still runnable from the monorepo

- **WHEN** a developer runs the test script from a working tree checkout
- **THEN** the script runs the existing test cases against the canonical CLI sources
- **AND** the script's location is documented in `packages/multivac/README.md`
