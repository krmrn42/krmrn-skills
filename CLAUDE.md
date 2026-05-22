# CLAUDE.md

This file guides Claude Code (claude.ai/code) when working in this repository.

## What this repo is

The **public** Claude Code plugin marketplace `krmrn-skills`. Mostly markdown that Claude reads at runtime via the `/plugin` system, with one exception: `packages/multivac/` is a publishable Node CLI (`@krmrn42/multivac`) that the `chat-search` plugin's `bin/` symlinks into. Companion to the private marketplace at [`krmrn42/skills`](https://github.com/krmrn42/skills); skills graduate here when they're stable and generally useful.

Currently ships these plugins:

- `skill-linting` (skill: `skill-linting`) — zero-deps structural lint for Claude Code skills.
- `chat-search` (slash commands `chat-search:find`, `chat-search:setup`; CLI `multivac`) — cross-project full-text search across local Claude Code conversations. Maintains its own SQLite FTS5 index from `~/.claude/projects/**/*.jsonl`; built-in TUI picker; resume drops you in the conversation's original project directory. The on-PATH CLI binary is `multivac`; the same binary is also distributable via `npm install -g @krmrn42/multivac` (canonical sources at `packages/multivac/`, plugin `bin/` symlinks into it).
- `prdspec` (slash commands `/prd`, `/epics`, `/stories`, `/push`) — Requirements Management Framework: PM exploration → Pitch → Epics → User Stories → tracker push.

## Dual-distribution shape (multivac)

The `chat-search` plugin and the `@krmrn42/multivac` npm package ship the **same code** from the same source tree. Canonical files live at `packages/multivac/src/`; the plugin's `bin/multivac`, `bin/indexer.js`, and `bin/picker.js` are git-tracked symlinks into that directory. A single version string lives in three files — `packages/multivac/package.json`, `plugins/chat-search/.claude-plugin/plugin.json`, and the matching entry in `marketplace.json` — and the lint enforces all three agree (rule `marketplace.plugin.package-version-sync`).

## Releasing

See [`RELEASING.md`](./RELEASING.md) for the full procedure. Two flows:

- **Plugin-only release** (e.g., `skill-linting`, `prdspec`): bump two version sites, PR, squash-merge, then `claude plugin tag plugins/<name> --push` from `main` → creates `{plugin-name}--v{version}` tag.
- **`chat-search` joint release** (also publishes `@krmrn42/multivac` to npm): bump three version sites, PR, squash-merge, then from `main` create *both* `chat-search--vX.Y.Z` (via `claude plugin tag`) and `multivac-vX.Y.Z` (manually via `git tag`). The latter triggers `.github/workflows/publish-multivac.yml`.

**Always tag on `main` after squash-merge**, not on the feature branch — squash creates a new SHA and a branch-side tag would be unreachable from `main`.

## Authoring rules

Defer to the `skill-authoring` skill from the [`krmrn42/skills`](https://github.com/krmrn42/skills) marketplace whenever creating or editing a SKILL.md / plugin manifest here. It encodes Anthropic's published constraints and the conventions used across both marketplaces.

Install once:

```
/plugin marketplace add krmrn42/skills
/plugin install authoring@krmrn42-skills
```

## Commit and merge policy

**All changes go through a pull request — including doc-only or single-character fixes.** Direct commits or pushes to `main` are not allowed. The PR workflow is:

1. Branch from `main` with a Conventional-Commits-style scope: `feat/<scope>`, `fix/<scope>`, `docs/<scope>`, `chore/<scope>`.
2. Commit on that branch with Conventional Commits messages (see `git log --oneline` for examples in this repo).
3. `git push -u origin HEAD`, then `gh pr create`.
4. After merge to `main`, start follow-up work on a fresh branch — never reuse a merged branch.
5. The merge strategy is **squash-merge** so `main`'s history stays linear and tag SHAs are unambiguous.
6. Tag on `main` after merge (never on the feature branch). See [`RELEASING.md`](./RELEASING.md) for the tag conventions.

This policy applies to you (Claude) too. If you find yourself about to run `git push` on `main`, stop — you're on the wrong branch. Run `git checkout -b <scope>/<topic>` and start a PR instead.

## Local development workflow

Install the marketplace from the working tree so edits take effect immediately:

```
/plugin marketplace add /path/to/krmrn-skills
/plugin install skill-linting@krmrn-skills
```

After editing a skill, reload it in the test session (re-run `/plugin install` or restart the session).

**Linting:** `make lint-skills` (warnings non-blocking) or `make lint-skills-strict` (warnings = failures). Pre-commit is wired via `.pre-commit-config.yaml`; install with `pre-commit install`.

## Repository layout

```
.claude-plugin/marketplace.json         # marketplace manifest
plugins/<plugin-name>/
  .claude-plugin/plugin.json            # per-plugin manifest
  README.md                             # human-facing overview
  skills/<skill-name>/
    SKILL.md                            # ALWAYS-loaded entry point
    references/*.md                     # progressive-disclosure deep dives
    templates/*.md                      # output templates
```

A new plugin is added by creating `plugins/<name>/` with its `.claude-plugin/plugin.json`, then registering it in the top-level `marketplace.json` `plugins` array.

## Architecture invariants (must preserve when editing)

1. **Progressive disclosure.** Only `SKILL.md` is loaded into Claude's context when a skill activates. `references/` and `templates/` files load on demand. Every reference must be **self-contained** — readable without `SKILL.md` in context.
2. **The skill `description` frontmatter is the trigger surface.** Claude reads it to decide whether to auto-invoke. It is a full paragraph naming user phrasings, deliverables, and methodology — not a tagline.
3. **Manifests must stay in sync.** `version` in `plugins/<name>/.claude-plugin/plugin.json` and the matching entry in `marketplace.json` must agree. Plugin name in `plugin.json` must match the directory name and the marketplace `source` path. The linter enforces this.
4. **Marketplace `pluginRoot`.** `marketplace.json` sets `metadata.pluginRoot: "./plugins"`, and each plugin's `source` is relative to repo root (e.g., `./plugins/skill-linting`).

## Style conventions for skill content

- **Diagrams.** Mermaid only. No ASCII block diagrams. For architecture diagrams use C4 notation.
- **Citations.** Internal: `path/to/doc.md §3.2 — "verbatim quote"`. External: `[Title](URL)`. Date all pricing.
- **Tone in `SKILL.md` and references.** Direct, prescriptive, second-person. The skill *is* the operating instructions Claude follows.
- **No emoji** in skill content unless the user asks.

## Contributing

This is a public marketplace open to community contributions. See [CONTRIBUTING.md](./CONTRIBUTING.md) for the bar. When helping a contributor draft a plugin, route them through the `skill-authoring` skill first.
