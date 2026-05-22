# Releasing

This document covers two release flows:

1. **Plugin-only release** — version bump for a plugin that ships **only** through the Claude Code marketplace (e.g., `skill-linting`, `prdspec`). No npm artifact.
2. **`chat-search` + `@krmrn42/multivac` joint release** — version bump for the plugin that also ships its CLI to npm. Requires three coordinated version sites, two tags, and the GitHub Actions publish workflow.

Both flows assume you're starting from a clean checkout of `main` with the merge for the feature branch already done.

## Tag conventions used in this repo

| Tag pattern | Created by | Purpose | Triggers |
|---|---|---|---|
| `{plugin-name}--v{X.Y.Z}` (two dashes before `v`) | `claude plugin tag` | Claude Code's documented per-plugin release marker. Validates plugin.json + marketplace entry agree. | Nothing CI-side; metadata only |
| `multivac-v{X.Y.Z}` (one dash before `v`) | `git tag` (manual) | `chat-search`-specific. Triggers the npm publish workflow. | `.github/workflows/publish-multivac.yml` → publishes `@krmrn42/multivac` to npm |

For `chat-search` releases we create **both** tags. For other plugins we create only the `{plugin-name}--v{X.Y.Z}` tag.

## Why tag on `main` after merge (not on the feature branch)

We **squash-merge** PRs. A squash-merge creates a new commit on `main` with a different SHA than any commit on the feature branch. If you tag the branch commit before merge:

- The tag points at a SHA that's not reachable from `main` after squash.
- `git describe`, GitHub Releases UI, and bisects all show a commit that isn't in `main`'s history → confusing.
- The publish workflow still runs (push of any matching tag triggers it), so the technical outcome is fine, but the audit trail is muddled.

**Always:** merge first, `git checkout main && git pull`, then tag.

---

## Flow 1 — Plugin-only release

For `skill-linting`, `prdspec`, and any future marketplace-only plugin.

### 1. On a feature branch, bump two version sites

- `plugins/<plugin-name>/.claude-plugin/plugin.json` → `"version": "X.Y.Z"`
- `.claude-plugin/marketplace.json` → `plugins[<plugin-name>].version: "X.Y.Z"`

The `marketplace.plugin.version-sync` lint rule fails the PR if these disagree.

### 2. Add a CHANGELOG entry (if the plugin has a CHANGELOG.md)

Keep-a-Changelog format. Otherwise update the plugin's README or open issues for the changes shipped in this version.

### 3. PR → squash-merge to `main`

CI (`make ci`) runs lint + lint unit tests; the version-sync rule blocks on skew.

### 4. Tag on `main`

```bash
git checkout main
git pull
claude plugin tag plugins/<plugin-name> \
  --message "<plugin-name> %s" \
  --push
```

`claude plugin tag` re-validates plugin.json + marketplace entry agree, creates `{plugin-name}--v{version}` from `plugin.json`'s version, and pushes to `origin`. Use `--dry-run` first if you want to preview.

If `claude plugin tag` reports a mismatch, the lint should have caught it before merge — investigate why CI passed. Don't `--force` past it.

---

## Flow 2 — `chat-search` + `@krmrn42/multivac` joint release

For the plugin whose CLI also ships to npm as `@krmrn42/multivac`.

### 1. On a feature branch, bump **three** version sites

- `packages/multivac/package.json` → `"version": "X.Y.Z"`
- `plugins/chat-search/.claude-plugin/plugin.json` → `"version": "X.Y.Z"`
- `.claude-plugin/marketplace.json` → `plugins[chat-search].version: "X.Y.Z"`

The `marketplace.plugin.package-version-sync` lint rule fails the PR if any of these disagree.

### 2. Add a CHANGELOG entry

`plugins/chat-search/CHANGELOG.md`, Keep-a-Changelog format:

```markdown
## [X.Y.Z] — YYYY-MM-DD

### Renamed (BREAKING)
- …

### Added
- …

### Changed (internal)
- …
```

Bump dates only in the `## [X.Y.Z]` heading line. Cross-link to the OpenSpec change if one drove the release.

### 3. PR → squash-merge to `main`

CI runs:
- `make lint-skills-strict` — the three-way version-sync rule blocks on skew
- `make test-lint` — unit tests for the lint logic itself
- (The publish workflow is **not** triggered yet; it listens for tags, not branch pushes.)

### 4. Tag on `main` — both tags

```bash
git checkout main
git pull

# Tag 1: Claude Code convention — validates the manifests agree.
claude plugin tag plugins/chat-search \
  --message "chat-search %s" \
  --push

# Tag 2: npm publish trigger.
git tag --annotate \
  --message "multivac vX.Y.Z" \
  multivac-vX.Y.Z
git push origin multivac-vX.Y.Z
```

Order matters slightly: do the `claude plugin tag` first because it cross-validates the manifests before the npm publish actually starts. If `claude plugin tag` fails, the npm tag still goes through — that's OK in failure mode (the publish workflow has its own version-vs-package.json assertion that will fail before npm sees the package) but it's nicer to catch the problem at the local tag step than in CI.

### 5. Watch the publish workflow

Go to `https://github.com/krmrn42/krmrn-skills/actions/workflows/publish-multivac.yml`. The workflow runs four protections before `npm publish`:

1. Tag-version vs `package.json` version assertion (catches mistagging).
2. `make lint-skills-strict` (catches any three-way skew that snuck past PR review).
3. `make test-lint` (catches regressions in the lint logic).
4. `npm publish --access public` only runs if all three pass.

### 6. Verify the publish

```bash
# Should show the new version.
npm info @krmrn42/multivac version

# From a clean shell on any machine with Node ≥22.5.
npx -y @krmrn42/multivac --version
```

The npm version badge in `plugins/chat-search/README.md` updates automatically (it reads from the npm registry).

---

## Failure recoveries

### "I tagged the wrong SHA / wrong version"

The publish workflow's tag-vs-`package.json` assertion catches this — no publish happens. Recover:

```bash
# Local + remote tag removal
git tag -d multivac-vX.Y.Z
git push origin :refs/tags/multivac-vX.Y.Z

# (If you also created the plugin tag wrongly, repeat for it:)
git tag -d chat-search--vX.Y.Z
git push origin :refs/tags/chat-search--vX.Y.Z

# Re-tag at the correct SHA and re-push.
```

### "The publish workflow failed (e.g., npm registry hiccup)"

Tags are immutable on npm — once a version number is taken, you can't reuse it (npm allows `unpublish` only within 72 hours). If the failure was *before* `npm publish`, just delete and re-push the tag. If `npm publish` succeeded but a later step failed, you have a published package and need to bump the version (`X.Y.Z` → `X.Y.Z+1`) and re-release from step 1.

### "I forgot to bump a version site and the PR's CI failed"

The version-sync lint rule names all three files and their current values. Bump the lagging file(s), push another commit to the PR.

### "I want to amend the latest tag without re-releasing"

Don't. Tags are part of the release contract. If you discover a problem after release, bump the version and ship a fix.

---

## Pre-flight (one-time setup; already done as of v0.6.0)

For posterity / a fresh maintainer setup:

1. Register the `@krmrn42` scope on npm (`npm org create krmrn42`).
2. Generate an `NPM_TOKEN` with publish scope; add as `NPM_TOKEN` repository secret in GitHub Actions settings.
3. Confirm `claude` CLI is installed locally for `claude plugin tag`.
4. Confirm Node ≥22.5 locally for `npm pack` / `npm publish` smoke tests.
