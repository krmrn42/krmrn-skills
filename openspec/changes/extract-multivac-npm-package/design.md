## Context

The `chat-search` plugin already ships a fully self-contained zero-dependency Node CLI (`plugins/chat-search/bin/ccsearch`, ~1450 lines plus `indexer.js` and `picker.js`). It only requires Node 22.5+ for `node:sqlite`. The runtime check at the top of `ccsearch` already aborts with a clear error on older Node. There is no transpile step, no bundler, no test framework beyond the bash-driven `ccsearch.test.sh`.

This change wraps that CLI as a publishable npm package without rewriting its search logic, and at the same time completes the rename captured in `plugins/chat-search/NAMING.md`: the on-PATH binary becomes `multivac` everywhere. The constraints worth pinning before discussing decisions:

- The package is `@krmrn42/multivac`. The bin is `multivac`. The historical name `ccsearch` ceases to exist as an active binary; it survives only in the rename note in `NAMING.md` and a one-line CHANGELOG entry.
- This repo (`krmrn-skills`) is a Claude Code marketplace, not a JavaScript monorepo. There is no existing `package.json` at the root, no `pnpm` / `npm` workspaces config, no `tsconfig`.
- The marketplace lint (`make lint-skills`) is Python-based and already enforces some manifest invariants. Adding a version-sync check on top is straightforward.
- Help-text framing stays Claude-Code-specific for this release. Genericization to "AI chat archives across tools" (per the open question in `NAMING.md`) is deferred until an adapter for a second tool actually exists.
- Stakeholders: marketplace users who installed `chat-search` via `/plugin install` (see a binary rename inside `~/.claude/plugins/.../bin/`, transparent to them); shell-side `ccsearch` users who ran `/chat-search:setup` (see a broken `~/.local/bin/ccsearch` symlink until they re-run setup); a new audience of users who reach for `npx @krmrn42/multivac` before they know about Claude Code plugins.

## Goals / Non-Goals

**Goals:**
- One source of truth for CLI code: a developer changes one file under `packages/multivac/src/` and both the npm package and the marketplace plugin pick it up.
- Two install paths that converge on the same skill experience: `npm install -g @krmrn42/multivac && multivac init` and the existing `/plugin install chat-search@krmrn-skills`.
- Zero-friction `npx`: `npx -y @krmrn42/multivac` runs without prior install on any machine with Node 22.5+.
- Clean rename: `ccsearch` is gone from binaries, slash commands, and help text. Users who symlinked it via `/chat-search:setup` get a one-step cleanup path.
- Atomic releases: the npm version, the plugin version, and the marketplace entry version always agree; the lint refuses skew.

**Non-Goals:**
- Publishing a JavaScript library API (`import { search } from '@krmrn42/multivac'`). Day-one this is CLI-only. A library API can come later under a separate change.
- A `ccsearch` backward-compat alias bin name. NAMING.md raised this as an open question; this thread resolves it as **no alias**. The rename is a hard cut documented in CHANGELOG.
- Migrating to a JS workspaces tool (npm workspaces, pnpm, turbo). The monorepo is two directories with no shared build graph.
- A standalone executable (single-binary, no Node required). The runtime requirement remains Node 22.5+; pkg/bun/deno builds are out of scope.
- Genericizing help/README phrasing to non-Claude-Code archives. Scope stays Claude Code for this release; the name `multivac` anticipates the broader future per NAMING.md.
- Auto-modifying the user's shell-rc files. This is a long-standing policy of `/chat-search:setup` and `multivac init` inherits it.

## Decisions

### D1 — Plugin `bin/` populated via symlinks checked into the repo (over a build step)

**Decision:** `plugins/chat-search/bin/{multivac,indexer.js,picker.js}` (and the test script if it stays in `bin/`) become git-tracked symlinks pointing at the canonical sources under `../../../packages/multivac/src/` (relative paths). The plugin's `bin/` is never written to by a build step at install time.

**Why:** Git supports symlinks across Linux, macOS, and WSL — and the plugin's `bin/` is ultimately read by Claude Code's `Bash` tool, which resolves symlinks natively. A check-in-the-output approach is simpler than introducing a build pipeline this repo doesn't currently need. The marketplace lint can verify the symlinks resolve to existing files inside `packages/multivac/src/`.

**Alternatives considered:**
- *Build step that copies sources on `prepack` / via a Makefile target.* Rejected because it introduces a divergence window: a developer who edits `plugins/chat-search/bin/multivac` directly (forgetting it should be regenerated from `packages/multivac/`) would not see the lint complain until the next packaging run. Symlinks make the dependency loud and unambiguous.
- *Single canonical directory (no `packages/multivac/src/`).* Rejected by the user in favor of the monorepo layout. The user-facing rationale: long-term, the npm package may grow files (LICENSE, package-specific README, NAMING.md) that don't belong inside a plugin directory.

**Risk:** Symlinks misbehave on Windows. **Mitigation:** Claude Code's documented platform support is Linux/macOS/WSL. Native Windows is not a supported runtime today; if a Windows user installs via npm, they get the package contents (which never traverses the plugin symlink), so they are unaffected.

### D2 — `multivac init` shells out to the `claude` CLI; does not edit `~/.claude.json` directly

**Decision:** `multivac init` invokes `claude /plugin marketplace add krmrn42/krmrn-skills` and `claude /plugin install chat-search@krmrn-skills` as subprocesses, surfacing stdout/stderr to the user, and never touches `~/.claude.json`, `~/.claude/`, or any other Claude Code config file directly.

**Why:** Claude Code's `/plugin` command is the documented public interface. Its on-disk file format is internal and may change between versions. Driving it via the supported CLI keeps the init command's correctness coupled to the documented behavior, not to a snapshot of a JSON schema. It also means `claude --version`'s own plugin-system version controls the install logic, not a vendored fork.

**Alternatives considered:**
- *Direct edit of `~/.claude.json`.* Rejected — fragile, undocumented, and would require keeping a JSON-patching codepath in sync with Claude Code releases.
- *Print instructions only (no automation).* Rejected as the primary path because it makes the init UX strictly worse than `/plugin install`. We keep this as the **fallback** when `claude` is not on `$PATH`, per the spec.

**Risk:** The exact CLI invocation that drives `/plugin install` non-interactively may differ across Claude Code versions. **Mitigation:** `multivac init` runs `claude --version` first and refuses to proceed (with a clear "manual install" message) on versions older than the supported floor. The floor is documented in `packages/multivac/README.md`.

### D3 — Reserved-subcommand collision: use `--` separator for literal-query escape

**Decision:** `init` is a reserved positional subcommand. To search for the literal token `init`, users invoke `multivac -- init` (POSIX-standard end-of-options marker, already widely understood). The CLI's existing positional parser is extended minimally: if `argv[0]` (after flags) equals `init`, route to the init subcommand; if it equals `--` (the literal two-character marker), treat all remaining tokens as the query.

**Why:** `--` is the least surprising convention. It avoids inventing a new flag (`--query`) and avoids the foot-gun of users accidentally invoking `init` thinking it's a search term.

**Alternatives considered:**
- *`multivac --query init` as the escape.* Rejected because adding a new flag for a one-character corner case bloats the help surface, and the flag would have no meaning for any other positional argument.
- *No reservation — make init a flag like `--init`.* Rejected because the user's requested install path is literally `multivac init`, and subcommands are the idiomatic shape for that. The conflict is real but tiny — "init" is an unlikely standalone query and the escape exists.

**Risk:** Existing scripts piping `init` as a literal query break. **Mitigation:** the literal-query case is documented in `--help` and in CHANGELOG; the breakage is announced as such.

### D4 — Help-text program name is a hardcoded literal `"multivac"`

**Decision:** The CLI's help text (`buildHelp()`) emits the literal string `multivac` everywhere the program name appears — `usage:` synopsis lines and every `Examples:` entry. No `process.argv[1]` basename detection, no sanitization, no dynamic substitution.

**Why:** With a single bin name, the dynamic-program-name approach (originally considered for a dual-bin design) collapses to dead code. A hardcoded literal is simpler, faster to grep against, and removes a small attack surface (a malicious symlink name cannot influence help output because the help doesn't read its own basename).

**Alternatives considered:**
- *`process.argv[1]` basename with a `[A-Za-z0-9_-]+` sanitizer (the previous design).* Rejected once the bin set collapsed to one entry. Useful only if a second bin name (or user-controlled symlink) ever returns; revisit then.

### D5 — Package `version` is the marketplace plugin `version`, with no independent npm-versioning

**Decision:** A single version string lives in `packages/multivac/package.json`, `plugins/chat-search/.claude-plugin/plugin.json`, and `.claude-plugin/marketplace.json` (the `chat-search` entry). The marketplace lint enforces equality. The first published version is `0.6.0` — both files bump together from the plugin's current `0.5.0`, mirroring the rename as a minor-version event in the existing version line. The release procedure bumps all three together via a release-helper script (or a single sed-driven Makefile target).

**Why:** The npm package IS the plugin's CLI. There is no meaningful divergence: a CLI change that breaks the plugin would equally break npm users. Co-versioning prevents users from comparing "plugin 0.5 vs CLI 0.6" and getting confused. Continuing the version line rather than resetting to `0.1.0` keeps changelog continuity for plugin users.

**Alternatives considered:**
- *Reset npm to `0.1.0`.* Rejected because users would see a regression from `0.5.0 → 0.1.0` in the plugin install path, which is the documented primary distribution channel today.
- *Independent version streams.* Rejected because we have no concrete reason to ever ship a CLI change without shipping it through the plugin too, and the cognitive overhead of two version streams isn't free.

### D6 — Publish workflow: GitHub Actions, triggered by a `multivac-vX.Y.Z` tag

**Decision:** Add a GitHub Actions workflow at `.github/workflows/publish-multivac.yml` that triggers on pushed tags matching `multivac-v*`. The workflow runs `make lint-skills-strict`, then `cd packages/multivac && npm publish --access public` using an `NPM_TOKEN` secret. No publish from local machines.

**Why:** Reproducible, auditable, and only needs the npm token to live in one place. Tagging is the natural release signal and visibly couples a git SHA to a published artifact.

**Alternatives considered:**
- *Publish on every push to `main`.* Rejected — too aggressive, would require version-bump-only-on-source-change logic.
- *Publish from a developer's machine.* Rejected — distributes secrets too widely and bypasses lint.

### D7 — `init` subcommand lives in the same `multivac.js` file as the rest

**Decision:** The `init` codepath is a ~50-line addition to the renamed `multivac.js` (or a `src/init.js` sibling file imported by it). No new dependency, no extracted submodule, no template engine for the printed slash-command instructions.

**Why:** The init subcommand is small and self-contained. Splitting it across many files would obscure rather than clarify.

### D8 — Backward-compat for shell-side `ccsearch` symlink users: detect-and-clean inside `/chat-search:setup`

**Decision:** No `ccsearch` bin alias ships in either the npm package or the marketplace plugin. Users who previously ran `/chat-search:setup` and have `~/.local/bin/ccsearch` will find that symlink dangling (its target file no longer exists). The `/chat-search:setup` slash command is updated so that, before symlinking the new `multivac`, it inspects the target directory for a `ccsearch` symlink whose readlink resolves into the plugin's `bin/` directory; if found, it `unlink`s that symlink and prints a one-line note ("removed stale `ccsearch` symlink from prior install"). A `ccsearch` file that is not a symlink, or a symlink resolving outside the plugin's `bin/`, is left untouched and surfaced to the user.

**Why:** The hard-cut approach (no bin alias) is the user's explicit choice. Cleaning up the artifact of the prior install path inside the slash command that created it is the least-surprising place to do so. It keeps shell-side users' `$PATH` tidy without an unprompted destructive action — only a symlink we own gets removed.

**Alternatives considered:**
- *Ship a `ccsearch` bin alias for one release cycle, then deprecate.* Rejected per user direction.
- *Print a manual cleanup instruction (no automated unlink).* Rejected because the symlink targets a known plugin-owned path; we created it, we can remove it. The blast radius is small and well-bounded.
- *Touch any `ccsearch` file regardless of where the symlink points.* Rejected — too aggressive, would risk clobbering an unrelated user binary that happens to share the name.

**Risk:** A user has a `ccsearch` symlink we created, then renamed/moved their plugin directory manually so the readlink no longer resolves into the canonical plugin `bin/`. Our detector misses it and leaves the dangling symlink in place. **Mitigation:** the slash command output mentions the detection rule ("only symlinks pointing into the plugin's bin/ are removed") so users with unusual setups can clean up by hand.

### D9 — NAMING.md lives at `packages/multivac/NAMING.md`

**Decision:** `plugins/chat-search/NAMING.md` moves to `packages/multivac/NAMING.md`. The historical location may either be deleted or replaced with a one-line stub pointing at the new path (implementer's choice — both are acceptable to the marketplace lint).

**Why:** The doc is a decision record for the package's identity (`@krmrn42/multivac`, the `multivac` binary), not the plugin's. The package directory is where future readers will look. The doc is excluded from the published npm tarball via the `files` allowlist (`src/`, `README.md`, `LICENSE` only).

**Alternatives considered:**
- *Leave it in `plugins/chat-search/`.* Rejected because the file's subject matter has outgrown the plugin's directory.
- *Move to a repo-level `docs/decisions/` directory.* Rejected because this repo doesn't currently have such a directory and a one-off mkdir for a single file is over-engineering.

## Risks / Trade-offs

- **[Hard cut on `ccsearch` binary breaks shell-side users until they re-run setup]** — Anyone with `~/.local/bin/ccsearch` on `$PATH` will hit "command not found" until they re-run `/chat-search:setup`. → **Mitigation:** the CHANGELOG entry explicitly names this; `/chat-search:setup` detects the stale symlink and cleans up; the plugin description and `MANUAL.md` lead with the new name. The blast radius is bounded — `/chat-search:setup` is an opt-in command, so most plugin users were never affected to begin with.
- **[Symlinks confuse linters or editors]** — Some IDEs (and some shell tools) follow symlinks twice and show duplicate hits. → **Mitigation:** `make lint-skills` is the canonical source of truth; IDE noise is acceptable.
- **[`npx -y @krmrn42/multivac` is slow on first run]** — npm has to download. → **Mitigation:** documented in `--help` examples; subsequent runs hit the cache.
- **[`multivac init` shells out to `claude`, but `claude /plugin install` is not yet documented as scriptable]** — If Claude Code requires interactive confirmation for `/plugin install`, `init` cannot complete non-interactively. → **Mitigation:** the fallback prints the slash commands for the user to paste; the init exits 0 even on this path. If a future Claude Code release adds a `--yes` flag (or equivalent), update `init` to use it.
- **[npm package name `@krmrn42/multivac` requires npm org ownership]** — The scope `@krmrn42` must be registered on npm before publish. → **Mitigation:** the implementation tasks (`tasks.md`) start with registering the scope and adding the `NPM_TOKEN` secret to GitHub. The package name on the unscoped npm registry is also currently unclaimed (per `NAMING.md` 2026-05-19 check), so an accidental shadow-publish is not a concern.
- **[The OpenSpec capability folder name `ccsearch-cli-help` is now misleading]** — After this change, the CLI is `multivac` but the capability folder under `openspec/specs/` still says `ccsearch-cli-help`. → **Mitigation:** acceptable for archive continuity. A future change MAY rename the capability via a RENAMED operation if it becomes confusing; for now the spec text itself describes the multivac CLI clearly.

## Migration Plan

1. **Pre-flight (one-time):** Register the `@krmrn42` npm scope; add `NPM_TOKEN` to GitHub repo secrets.
2. **Source move + rename:** `git mv plugins/chat-search/bin/ccsearch packages/multivac/src/multivac.js`; `git mv plugins/chat-search/bin/{indexer,picker}.js packages/multivac/src/`; move the test script to `packages/multivac/test/multivac.test.sh`. Create relative symlinks in `plugins/chat-search/bin/` (`multivac`, `indexer.js`, `picker.js`) pointing back into `packages/multivac/src/`. Verify Claude Code resolves them.
3. **NAMING.md relocation:** `git mv plugins/chat-search/NAMING.md packages/multivac/NAMING.md`.
4. **Package authoring:** Write `packages/multivac/package.json`, `README.md`, `LICENSE`, `.npmignore` (if needed beyond `files`).
5. **CLI changes:** Add the `init` subcommand (D7), replace the hardcoded `ccsearch` banner with the hardcoded `multivac` banner (D4), implement the `--` literal-query escape (D3) in `multivac.js`.
6. **Slash-command rewrites:** Update `plugins/chat-search/commands/find.md` and `plugins/chat-search/commands/setup.md` so every `ccsearch` invocation becomes `multivac`. Extend `setup.md` with the stale-symlink cleanup step (D8).
7. **Lint addition:** Extend `make lint-skills` (or its underlying Python script) with the version-sync check.
8. **Docs:** Update `plugins/chat-search/README.md`, `MANUAL.md`, and `.claude-plugin/plugin.json` description to reference `multivac` and the npm install path. Add a CHANGELOG entry explaining the hard-cut rename.
9. **CI:** Add `.github/workflows/publish-multivac.yml`.
10. **First publish:** Tag `multivac-v0.6.0` (bumping from current `0.5.0`); confirm the GitHub Action publishes to npm; verify `npx -y @krmrn42/multivac --help` succeeds.

**Rollback:** if the publish goes wrong, `npm unpublish @krmrn42/multivac@<version>` within the 72-hour window. The plugin in this repo is unaffected by npm-side rollback — its `bin/` symlinks still resolve. If the rename itself proves disastrous (it should not — the surface is tiny), revert the merge commit; the prior `bin/ccsearch` script returns and `/chat-search:setup` resumes its prior behavior.

## Open Questions

- **OQ1**: Should `packages/multivac/README.md` duplicate the existing `plugins/chat-search/MANUAL.md` content, link to it, or carry a shorter npm-focused doc? The cleanest answer is a short npm-focused README that links to MANUAL.md for the full user guide, but the link target needs to be a GitHub URL (since npm-side users see the README on npmjs.com without repo context). Resolved during the README-authoring task.
- **OQ2**: The marketplace lint is Python; the version-sync check needs to parse JSON from three files. The existing lint already reads `marketplace.json` and `plugin.json`, so extending it is mostly adding a `packages/multivac/package.json` read and an equality assertion. Confirm during the lint-extension task.
- **OQ3**: When `/chat-search:setup` removes a stale `ccsearch` symlink, does it also need to print a note that the user should remove `~/.local/bin/ccsearch` from any shell aliases they configured? **Tentative answer: no** — we only own the symlink, not the user's shell config. The CHANGELOG line is the canonical place to call that out. Revisit if user feedback says otherwise.
- **OQ4**: NAMING.md raised the question of help-text genericization ("AI chat archives across tools" vs "Claude Code conversations"). This thread defers — stay Claude-Code-specific for `0.6.0`; revisit when a second-tool adapter actually lands.
