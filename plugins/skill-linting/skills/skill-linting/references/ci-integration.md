# CI integration — wiring `lint.py` into local dev and CI

How to invoke the linter from each integration surface: developer-driven (slash command, Make), commit-time (pre-commit hook), and CI-time (workflow). Each entry is a working snippet you can copy.

## Contents

- [Slash command (already shipped)](#slash-command-already-shipped)
- [Makefile target (this repo)](#makefile-target-this-repo)
- [Pre-commit hook (this repo)](#pre-commit-hook-this-repo)
- [GitHub Actions workflow (planned)](#github-actions-workflow-planned)
- [Other CI systems](#other-ci-systems)
- [Output format selection](#output-format-selection)

## Slash command (already shipped)

Users invoke the linter inside Claude Code with:

```
/skill-linting:lint                  # all skills in repo
/skill-linting:lint <path>           # specific plugin or skill
```

The slash-command file at [`commands/lint-skills.md`](../../../commands/lint-skills.md) tells Claude to invoke `python3 plugins/skill-linting/scripts/lint.py [path-or-empty]` and surface findings.

This is the user-facing entry point. CI and pre-commit invoke the script directly.

## Makefile target (this repo)

Add to `Makefile` at repo root:

```makefile
.PHONY: lint-skills
lint-skills:
	@python3 plugins/skill-linting/scripts/lint.py

.PHONY: lint-skills-strict
lint-skills-strict:
	@python3 plugins/skill-linting/scripts/lint.py --strict

.PHONY: ci
ci: lint-skills-strict
```

Invocation:

```bash
make lint-skills          # human-readable; warnings non-blocking
make lint-skills-strict   # warnings become errors
make ci                   # full CI suite (currently just strict lint)
```

The `make ci` target is the contract `dev-workflow` references — local CI parity. As we add other checks (markdown lint, etc.) they go behind `ci` too.

## Pre-commit hook (this repo)

Wire into `.pre-commit-config.yaml` at repo root:

```yaml
repos:
  - repo: local
    hooks:
      - id: skill-lint
        name: Skill structural lint
        entry: python3 plugins/skill-linting/scripts/lint.py
        language: system
        files: '^(plugins/.*\.md|plugins/.*/\.claude-plugin/plugin\.json|\.claude-plugin/marketplace\.json)$'
        pass_filenames: false
```

Two important pieces:

- **`pass_filenames: false`** — the linter does cross-file checks (manifest sync, every-plugin-registered) so it must see the whole repo, not just staged files. The `files:` regex is just the trigger.
- **`language: system`** — runs the system Python 3.11+ rather than spinning up a virtualenv.

To install the hook (consumers of this repo run this once):

```bash
pip install pre-commit          # or: brew install pre-commit
pre-commit install
```

Once installed, every `git commit` runs the linter. If it errors, the commit aborts.

To run the hook manually without committing:

```bash
pre-commit run skill-lint --all-files
```

### Why local-only and not a public hook (yet)

Per design decision in this plugin's scope: we wire pre-commit into *this* repo only for v0.1.0. We do **not** ship a `.pre-commit-hooks.yaml` for external consumption. When the linter has been exercised against more skills and the rule set is stable, we can add the public hook config and let other repos install via:

```yaml
repos:
  - repo: https://github.com/krmrn42/skills
    rev: <release-tag>
    hooks:
      - id: skill-lint
```

That's a v0.2+ enhancement.

## GitHub Actions workflow (planned)

We've deferred CI infrastructure per project decision. When CI lands, the workflow looks like:

```yaml
# .github/workflows/lint.yml
name: lint
on: [push, pull_request]

jobs:
  skill-lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - name: Run skill-lint
        run: python3 plugins/skill-linting/scripts/lint.py --strict --format github
```

`--format github` makes findings show up as inline annotations on PR diff views. `--strict` causes warnings to fail the workflow — pick whether to use it based on how strict you want CI.

## Other CI systems

The script is plain Python; CLI shape is identical everywhere. Examples:

**GitLab CI:**

```yaml
skill-lint:
  image: python:3.11
  script: python3 plugins/skill-linting/scripts/lint.py --strict --format json | tee skill-lint.json
  artifacts:
    reports:
      codequality: skill-lint.json
```

(Note: `--format json` emits findings array, not GitLab CodeClimate format — you'd want a small adapter.)

**CircleCI:**

```yaml
- run:
    name: Skill lint
    command: python3 plugins/skill-linting/scripts/lint.py --strict
```

**Jenkins:**

```groovy
sh 'python3 plugins/skill-linting/scripts/lint.py --strict'
```

## Output format selection

| Format | Use case | Sample line |
|---|---|---|
| `human` (default) | Terminal, slash command, local dev | `path/file.md\n  ERROR [rule.id]:42  message\n      fix:  …\n      docs: https://…` |
| `github` | GitHub Actions annotations | `::error file=path,line=42,title=rule.id::message \| Fix: … \| Docs: https://…` |
| `json` | Machine-readable for tooling, CI dashboards | array of `{file, line, severity, rule, message, fix, docs}` |

Every finding carries four contextual fields:

- **`message`** — what's wrong, with concrete values (e.g., `description is 1213 chars; spec caps at 1024`) and a one-sentence rationale of why the rule exists.
- **`fix`** — a concrete action ("trim by 189 chars; drop redundant phrasings"). Always paired with the message; never absent for an actionable finding.
- **`docs`** — URL to the canonical published source (Anthropic best-practices, Claude Code skills/plugins page, or `agentskills.io` spec). Absent for rules without a single canonical source (e.g., the exclusion-clause heuristic, which is documented in this repo's `skill-authoring` skill rather than externally).
- **`rule`** — stable rule ID. Use it to look up the rule in `references/checks-reference.md` for additional context, and to disable the rule in `.skill-lint.toml` if needed.

The script auto-detects color support via `sys.stdout.isatty()` for the human format. Pass `--no-color` to force plain text (useful for redirecting to files).

## Combining flags

Common combos:

| Goal | Invocation |
|---|---|
| Local dev — warn loud, don't block | `make lint-skills` |
| Pre-commit — block on errors only | `python3 plugins/skill-linting/scripts/lint.py` |
| CI — block on warnings too | `python3 plugins/skill-linting/scripts/lint.py --strict --format github` |
| Tooling integration | `python3 plugins/skill-linting/scripts/lint.py --format json --severity error` |
| Audit one plugin | `python3 plugins/skill-linting/scripts/lint.py plugins/architecture` |
| Errors only, machine-readable | `python3 plugins/skill-linting/scripts/lint.py --severity error --format json` |
