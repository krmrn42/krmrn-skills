# skill-linting

Hard structural lint for skills in this marketplace. The companion to `authoring/skill-authoring`: that skill *states* the rules, this one *enforces* them mechanically.

## What it does

Runs a zero-deps Python script ([`scripts/lint.py`](scripts/lint.py)) against every `SKILL.md`, `plugin.json`, and `marketplace.json` in the repo. Emits findings in two tiers:

- **Tier 1 — errors (block CI / pre-commit).** Mechanical, unambiguous: frontmatter validity, `name`/`description` length caps, name format and parent-dir match, body line cap, manifest version-sync between `plugin.json` and `marketplace.json`, every-plugin-registered.
- **Tier 2 — warnings (surface, don't block).** Surface deviation from Anthropic's modeled practice: third-person description heuristic, exclusion-clause detection, reference TOC threshold, reference depth (Anthropic's own skills follow strict hub-and-spoke; sibling cross-links surface as warnings), orphan references not linked from `SKILL.md` / plugin README.

Three output formats — `human` (terminal), `github` (Actions annotations), `json` (tooling). Single disable mechanism: a `.skill-lint.toml` config for repo-wide and per-skill disables (no per-line `noqa` escapes — disable decisions belong in version control, not in markdown bodies that load into Claude's context).

**Philosophy.** Tier-1 errors enforce Anthropic's *documented spec* — frontmatter validity, length caps, the listing-truncation cap, manifest version-sync. Tier-2 warnings surface deviation from Anthropic's *modeled practice* — patterns their own example skills follow but the spec doesn't strictly require (e.g., hub-and-spoke references, exclusion clauses on every description). Errors block; warnings inform.

## When it triggers

Auto-triggers in Claude Code on phrasings like:

- *"Lint my skill."*
- *"Check this SKILL.md."*
- *"Validate the marketplace manifest."*
- *"Are the manifests in sync?"*
- *"Run skill-lint."*
- *"Audit our skills."*

Explicit invocation:

```
/skill-linting:lint              # all skills in repo
/skill-linting:lint <path>       # specific plugin or skill
```

Or as a script:

```bash
python3 plugins/skill-linting/scripts/lint.py [PATH ...] [--strict] [--format ...]
```

Or as part of the build:

```bash
make lint-skills            # warnings non-blocking
make lint-skills-strict     # warnings = failures
make ci                     # full CI suite (currently includes strict lint)
```

## Output example

Default (human-readable):

```
plugins/architecture/skills/architecture-review/SKILL.md
  WARNING [frontmatter.description.exclusion-clause]  description has no exclusion clause; add a 'Not for…' sentence naming near-miss phrasings to prevent over-trigger
plugins/publish/skills/publish-document/SKILL.md
  ERROR [frontmatter.description.xml]  `description` contains XML/HTML tags; not permitted by spec
plugins/architecture/skills/architecture-review/references/views-and-beyond.md
  WARNING [reference.toc.missing]  reference is 321 lines (>100) and lacks `## Contents` heading in first 30 lines
      fix: add a `## Contents` section listing the H2 headings
```

GitHub Actions annotations:

```
::error file=plugins/publish/.../SKILL.md,title=frontmatter.description.xml::`description` contains XML/HTML tags
::warning file=plugins/architecture/.../views-and-beyond.md,title=reference.toc.missing::reference is 321 lines (>100)…
```

JSON:

```json
[
  { "file": "...", "severity": "error", "rule": "frontmatter.description.xml", "message": "...", "fix": null }
]
```

## Install

From a working copy of this repo:

```
/plugin marketplace add /home/data/repos/github.com/krmrn42/skills
/plugin install skill-linting@krmrn42-skills
```

The script needs Python 3.11+ on `PATH`. No other dependencies.

## Use it

Inside Claude Code:

```
/skill-linting:lint                                 # everything
/skill-linting:lint plugins/architecture            # narrow to one plugin
/skill-linting:lint plugins/process/skills/dev-workflow   # narrow to one skill
```

From the command line (from this repo):

```bash
python3 plugins/skill-linting/scripts/lint.py
python3 plugins/skill-linting/scripts/lint.py --strict --format github
python3 plugins/skill-linting/scripts/lint.py --severity error
python3 plugins/skill-linting/scripts/lint.py plugins/authoring
```

Exit codes:

- `0` — no findings (or only info-level, or only warnings without `--strict`)
- `1` — tier-1 errors found, or warnings found with `--strict`
- `2` — fatal (no marketplace.json, manifest unparseable)

## Disabling checks

Single mechanism: `.skill-lint.toml` at repo root. No per-line escapes. Three tiers, broadest to most precise:

```toml
# Tier 1 — repo-wide
[disable]
checks = ["frontmatter.description.exclusion-clause"]

# Tier 2 — per-skill (or per-plugin for manifest checks)
[per_skill."plugins/architecture/skills/architecture-review"]
disable = ["body.length"]
reason = "phase definitions are load-bearing"

# Tier 3 — per-instance allowlist for rules that fire multiple times in
# one file (today: only reference.depth). Pinned to (file, target) —
# refactoring within the file doesn't invalidate the entry.
[[allow."reference.depth"]]
file = "plugins/publish/skills/publish-document/references/sharing.md"
target = "targets.md"
reason = "Synthesis-with-citations: sharing.md is the cross-target capability matrix; provenance pointer to source data, not a content chain."
```

Every entry should ship with a `reason`. See [`skills/skill-linting/references/disabling-checks.md`](skills/skill-linting/references/disabling-checks.md) for the full schema, the three patterns that warrant tier-3 (synthesis-with-citations, fix-recipe pointer, structural disclaimer), and when each tier is the right tool.

## Files

```
plugins/skill-linting/
├── .claude-plugin/plugin.json
├── README.md (this file)
├── commands/
│   └── lint-skills.md                  # /skill-linting:lint slash command
├── scripts/
│   └── lint.py                         # the linter (zero deps, Python 3.11+)
└── skills/
    └── skill-linting/
        ├── SKILL.md                    # Claude-facing operating instructions
        ├── references/
        │   ├── checks-reference.md     # every rule with severity + fix
        │   ├── ci-integration.md       # Makefile, pre-commit, GH Actions
        │   └── disabling-checks.md     # noqa + .skill-lint.toml semantics
        └── templates/
            ├── skill-lint-config.md    # annotated .skill-lint.toml
            └── makefile-target.md      # Makefile target snippet
```

References load on demand via progressive disclosure — only `SKILL.md` is in context by default.

## Relationship to other skills

Three-skill ecosystem:

- **Anthropic's `skill-creator`** (`anthropics/skills`) — iteration / evaluation loop. Description optimizer (`run_loop.py`). Best for skills with verifiable outputs.
- **`authoring/skill-authoring`** (this marketplace) — advisory authoring guide. *States* the rules (length caps, description patterns, reference depth, repo conventions).
- **`skill-linting/skill-linting`** (this plugin) — automated structural enforcement. *Enforces* what skill-authoring states. Runs as a script in pre-commit and CI.

The split is deliberate: advisory guidance and mechanical enforcement have different shapes (markdown vs. Python) and different audiences (humans + Claude vs. CI). Keeping them separate keeps each focused.

## Limits — what's NOT checked yet

- **Auto-fix mode** (`--fix`) — TOC stub injection, marketplace `keywords` sorting. Planned v0.2.
- **Generic name detection** (`helper`/`utils`/etc.). Planned v0.2.
- **All-caps imperatives without rationale** (`ALWAYS`/`NEVER`/`MUST` not paired with reasoning). Planned v0.2.
- **Time-sensitive language detection.** Planned v0.2.
- **Public pre-commit hook** (so other repos can install it via `repo: github:krmrn42/skills`). Planned v0.2 once the rule set is stable.

## Customize

The single most opinionated decision is **what's tier 1 vs tier 2**. Tier boundaries are set in `scripts/lint.py` via the `severity` argument to each `emit()` call. Edit those to adjust enforcement strictness.

Common adjustment: if `frontmatter.description.exclusion-clause` is too aggressive in your context, change its severity from `"warning"` to suppress it via config repo-wide.
