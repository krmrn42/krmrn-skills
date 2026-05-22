# Contributing to krmrn-skills

Thanks for considering a contribution. This marketplace is opinionated about what makes a *good* Claude Code skill — readable, evidence-based, narrowly scoped, and structurally clean. The rules below exist so contributors don't have to re-litigate them in every PR.

## Scope of this marketplace

We accept:

- **Skills and plugins** that fit Claude Code's progressive-disclosure model (a short `SKILL.md` + on-demand `references/`).
- **General-purpose tooling** that serves a broad community — not internal team workflows or single-org integrations.
- **Evidence-based skills** that cite their sources (standards, vendor docs, named-author engineering writing).

We don't accept:

- Skills that exist mainly to advertise a product or service.
- Skills that are a thin wrapper over a single CLI command without added judgment or context.
- Closed-source or paywalled dependencies (a skill may *use* an SDK; it shouldn't require a paid SaaS for the skill itself to function).
- "Mega-skills" that conflate five tasks into one — split them.

If you're unsure, file an issue describing the use case before writing the body. It's much less work for everyone.

## Before you start

1. **Open an issue** describing the proposed plugin: trigger phrasings, deliverable, why this is general-purpose, what alternatives exist. We'll align on naming, category, and scope before code.
2. **Install the recommended tooling** (see [README — Recommended companion plugins](./README.md#recommended-companion-plugins)). The `authoring` skill encodes the rules in this document with worked examples; `skill-linting` enforces them mechanically.
3. **Read at least one existing plugin's `SKILL.md`** in this repo to internalize the tone and structure.

## Plugin structure

```
plugins/<plugin-name>/
├── .claude-plugin/plugin.json     # name, version, author
├── README.md                      # human-facing overview (optional but recommended)
└── skills/<skill-name>/
    ├── SKILL.md                   # ALWAYS loaded; ≤500 lines body
    ├── references/*.md            # on-demand deep dives; depth = 1
    └── templates/*.md             # outputs the skill emits
```

Rules (lifted from Anthropic's spec — enforced by `make lint-skills`):

- Plugin directory name must match `plugin.json:name` and the `source` path in `marketplace.json`.
- Skill `description` ≤ 1024 chars, third-person, paragraph form (not a tagline).
- Combined `name + description` should target ≤ 1100 chars (hard cap 1536).
- `SKILL.md` body ≤ 500 lines.
- Reference depth = 1: `SKILL.md` may link to `references/foo.md`, but `references/foo.md` should not chain into `references/bar.md` without justification (per-instance allowlist entries explain exceptions).
- `version` in `plugin.json` must match the entry in `marketplace.json`.

## Description as trigger surface

The `description` frontmatter is what Claude reads to decide whether to auto-invoke your skill. It's not a tagline — it's a paragraph that names:

1. **What the skill does** (one sentence).
2. **User phrasings that should trigger it** (concrete quotes, not generalities).
3. **The deliverable** (what the skill produces).
4. **Methodology or non-obvious behavior** worth signaling.
5. **An exclusion clause** — when *not* to trigger (the near-misses).

Read the `skill-authoring` skill's `description-design.md` reference for the pattern. The shortcut: open three random `SKILL.md` files in this marketplace, read their descriptions, and pattern-match.

## Style

- **Mermaid for diagrams.** No ASCII block diagrams.
- **Direct, prescriptive tone in `SKILL.md` and references.** Second-person ("you", "do this"). The skill *is* the operating instructions Claude follows — write it that way.
- **No emoji** unless a specific UX reason demands it.
- **Citations.** Internal: `path/to/doc.md §3.2 — "verbatim quote"`. External: `[Title](URL)`.

## Lint and CI

```bash
make lint-skills           # warnings non-blocking
make lint-skills-strict    # warnings = failures
```

To install the pre-commit hook locally:

```bash
pre-commit install
```

The pre-commit hook only blocks on tier-1 errors. Tier-2 warnings should be addressed or explicitly suppressed with a `reason` in `.skill-lint.toml`. PRs that add suppressions without a reason will be sent back.

## PR workflow

1. Branch from `main`.
2. Atomic commits, Conventional Commits style (e.g., `feat(skill-linting): add severity filter`).
3. Run `make lint-skills` locally — fix errors, justify warnings.
4. PR against `main` with a description that explains *why* (motivation, scope, trade-offs), not just *what*.
5. Be patient with review. Skills are *operating instructions* — small wording changes can change behavior. Reviewers will read closely.

## Review criteria

A reviewer will check, in order:

1. **Does the description trigger cleanly?** Does it name user phrasings? Does it have an exclusion clause? Would it auto-invoke on the right requests *and* avoid false positives?
2. **Is the skill self-contained?** Can someone read `SKILL.md` alone and understand the contract? Are references standalone deep-dives, not chained narratives?
3. **Is it evidence-based?** Are claims cited? Is anything time-sensitive (pricing, vendor capabilities) dated?
4. **Does it lint clean?** Tier-1 errors block. Tier-2 warnings need justification.
5. **Does the manifest match?** Names, versions, paths all aligned.
6. **Is the scope narrow enough?** Is this one skill, or three pretending to be one?

## Releasing

Until we cut a v1, version bumps happen per-plugin and use SemVer.

See [**RELEASING.md**](./RELEASING.md) for the full procedure. The short version:

- **Plugin-only release** (most plugins): bump two version sites (`plugins/<name>/.claude-plugin/plugin.json` + the matching `marketplace.json` entry), open a PR, squash-merge, then `claude plugin tag plugins/<name> --push` from `main` to create the `{plugin-name}--v{version}` tag.
- **`chat-search` joint release** (also publishes `@krmrn42/multivac` to npm): bump *three* version sites (the package's `packages/multivac/package.json` joins the two above), open a PR, squash-merge, then create both `chat-search--vX.Y.Z` (via `claude plugin tag`) and `multivac-vX.Y.Z` (manually with `git tag`) from `main`. The latter triggers the npm publish workflow.

Tag **on `main` after merge**, not on the feature branch — squash-merge creates a new SHA, and tagging the branch SHA leaves the tag pointing at a commit unreachable from `main`. The relevant lint rules (`marketplace.plugin.version-sync` and, for `chat-search`, `marketplace.plugin.package-version-sync`) catch version skew in CI before merge.

## Code of conduct

This project follows the [Contributor Covenant](./CODE_OF_CONDUCT.md). Report unacceptable behavior to the maintainers via a private GitHub message.

## Questions?

Open an issue with the `question` label. For private security or conduct concerns, contact the maintainers directly via GitHub.
