## Why

`ccsearch` is a self-contained, zero-dependency Node CLI that today only ships inside the `chat-search` Claude Code plugin. Users outside the Claude Code ecosystem (or those who want the tool before installing the plugin) have no convenient install path — they must clone the marketplace, locate `plugins/chat-search/bin/ccsearch`, and symlink it manually. Publishing the CLI as a standalone npm package unlocks `npx @krmrn42/multivac` for one-shot use and `npm install -g @krmrn42/multivac` for permanent install. A bundled `multivac init` subcommand performs the marketplace-plugin install so the search skill, slash commands, and TUI picker remain discoverable from inside Claude Code.

This change also completes the rename captured by the in-repo naming decision record (`plugins/chat-search/NAMING.md`): the on-PATH binary becomes `multivac` everywhere, including inside the marketplace plugin's `bin/` directory. There is no `ccsearch` alias — `ccsearch` ceases to exist as a binary name.

## What Changes

- New monorepo package directory `packages/multivac/` containing the npm-publishable artifact (the existing CLI sources renamed under `src/`, plus `package.json`, `README`, `LICENSE`, and the relocated `NAMING.md`).
- New CLI subcommand `multivac init` that drives Claude Code's `/plugin marketplace add` + `/plugin install` flow non-interactively (or prints copy-paste instructions when Claude Code is not detected).
- **BREAKING**: the binary inside the marketplace plugin renames from `bin/ccsearch` to `bin/multivac`. The two slash commands `/chat-search:find` and `/chat-search:setup` are updated to invoke `multivac` instead of `ccsearch`.
- **BREAKING**: users who previously ran `/chat-search:setup` and now have `~/.local/bin/ccsearch` on their `$PATH` will find it dangling (the symlink target file no longer exists at that path inside the plugin). They MUST re-run `/chat-search:setup` to get `~/.local/bin/multivac`. The updated `/chat-search:setup` slash command detects and removes a stale `ccsearch` symlink as a cleanup step.
- The npm package publishes a single bin name: `multivac`. The original `ccsearch` script name does not survive anywhere.
- The marketplace plugin `plugins/chat-search/` retains its manifest, slash commands, and `MANUAL.md`; its `bin/` directory becomes a thin symlink to the canonical CLI sources under `packages/multivac/src/`. The slash-command prose changes are exclusively about substituting `multivac` for `ccsearch` — the surface and flag set are unchanged.
- The help-text banner literal (`usage: ccsearch …`) is rewritten to `usage: multivac …`. All examples and prose in `--help` switch to `multivac`. Plugin-side documentation (`MANUAL.md`, `README.md`, the plugin `description`) is updated wholesale.
- `plugins/chat-search/NAMING.md` moves to `packages/multivac/NAMING.md` (it is load-bearing for the npm package's identity, not the plugin's — and the package directory is now its canonical home). A stub `plugins/chat-search/NAMING.md` may be left as a one-line pointer for backlink stability.
- New CI: GitHub Actions workflow publishes to npm on a `multivac-v*` tag push.
- New lint check: all three of `packages/multivac/package.json#version`, `plugins/chat-search/.claude-plugin/plugin.json#version`, and the matching `marketplace.json` entry's `version` MUST agree, enforced by `make lint-skills`.
- Version line for the first release: all three files bump from `0.5.0` to `0.6.0` together — the version number is shared and incremented through the rename.

## Capabilities

### New Capabilities
- `multivac-npm-package`: defines the published npm artifact — scoped name `@krmrn42/multivac`, single bin (`multivac`), Node 22.5+ engine constraint, `files` allowlist, license, and the contract that `npx @krmrn42/multivac <query>` runs the search without prior install.
- `multivac-init-command`: defines the `multivac init` subcommand — what it does, how it detects Claude Code, what it writes (nothing under `~/.claude/` directly — it shells out to `claude`), how it reports success/failure, and how it stays idempotent.
- `multivac-monorepo-layout`: defines the in-repo packaging — `packages/multivac/` directory, the plugin-as-shim relationship, the renamed plugin bin (`plugins/chat-search/bin/multivac`), version-sync invariants, and the boundary between plugin-owned vs package-owned files.

### Modified Capabilities
- `ccsearch-cli-help`: program-name literal in the `usage:` synopsis line and in every `--help` example SHALL change from `ccsearch` to `multivac`. All other help-output requirements (section order, flag coverage, exit-code documentation, constraints-between-flags surfacing, stdout/zero-exit contract, parser/help drift test) remain unchanged. The capability folder name in `openspec/specs/` is preserved (`ccsearch-cli-help`) for archive continuity; a separate future change MAY rename the capability if warranted.

## Impact

- **Code**: `plugins/chat-search/bin/{ccsearch,indexer.js,picker.js,ccsearch.test.sh}` moves to `packages/multivac/src/` — the entrypoint is renamed `ccsearch.js → multivac.js`; helper module filenames (`indexer.js`, `picker.js`) are unchanged. The plugin's `bin/` becomes a single symlink `plugins/chat-search/bin/multivac → ../../../packages/multivac/src/multivac.js` plus parallel symlinks for the helper modules. The CLI's hard-coded banner string changes from `ccsearch` to `multivac`.
- **Slash commands**: `plugins/chat-search/commands/find.md` and `commands/setup.md` are rewritten so every `ccsearch` token becomes `multivac`. `setup.md` additionally gains a cleanup step that removes a stale `~/.local/bin/ccsearch` symlink (only if it points into the plugin's `bin/`) before symlinking the new `multivac`.
- **APIs**: No public Node API exported by the package on day one — it is a CLI, not a library. The CLI's flag surface is unchanged.
- **Dependencies**: No new runtime dependencies. `package.json` declares `engines.node >= 22.5.0`. No `dependencies` block, no transitive deps.
- **Systems**: New CI job to publish to npm on a tag matching `multivac-v*`. The marketplace lint flow grows the version-sync check.
- **User-facing docs**: `plugins/chat-search/README.md`, `MANUAL.md`, and the `plugin.json` `description` switch to `multivac` and gain an "Install via npm" section. The new `packages/multivac/README.md` is the npm-facing user guide.
- **Decision archive**: `NAMING.md` moves from `plugins/chat-search/` to `packages/multivac/` so it sits alongside the canonical sources it justifies.
- **Open questions deferred to design.md**: (a) whether the plugin's `bin/` is populated by checked-in symlinks vs a build step; (b) whether `multivac init` shells out to `claude /plugin install` or edits `~/.claude.json` directly; (c) exact cleanup semantics for stale `ccsearch` symlinks (warn vs remove; whether to touch non-plugin-owned symlinks at all).
