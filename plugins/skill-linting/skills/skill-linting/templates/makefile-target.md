# Template — Makefile target wiring

Snippet for the repo root `Makefile`, wiring `make lint-skills`, `make lint-skills-strict`, and `make ci`.

```makefile
# ---------------------------------------------------------------
# Skill linting — invokes plugins/skill-linting/scripts/lint.py
# ---------------------------------------------------------------

.PHONY: lint-skills
lint-skills:
	@python3 plugins/skill-linting/scripts/lint.py

.PHONY: lint-skills-strict
lint-skills-strict:
	@python3 plugins/skill-linting/scripts/lint.py --strict

.PHONY: ci
ci: lint-skills-strict
```

## How to use

1. Copy the snippet into your repo's top-level `Makefile`. Create one if it doesn't exist.
2. The `@` prefix suppresses the `python3 …` echo so the lint output is clean.
3. `make ci` is the contract — CI workflows invoke `make ci`, and the same target runs locally. Adding new check categories (markdown lint, JSON schema validation, etc.) means adding their phony targets and wiring them in as `ci: target1 target2 …`.

## Choosing strict vs non-strict for `ci`

- **Strict (`make ci → lint-skills-strict`)** — warnings count as failures. Use this for a marketplace where every skill goes through review and warnings are expected to be addressed.
- **Non-strict (`make ci → lint-skills`)** — only tier-1 errors fail. Warnings surface for human review but don't block. Better for early development when warnings are common.

The default in the snippet is **strict**, matching this repo's intent: every skill should be authored to pass tier-2 checks too.

## Combining with other targets

A typical `Makefile` for a skill marketplace:

```makefile
.PHONY: lint-skills lint-skills-strict lint-md format check ci

lint-skills:
	@python3 plugins/skill-linting/scripts/lint.py

lint-skills-strict:
	@python3 plugins/skill-linting/scripts/lint.py --strict

lint-md:
	@npx markdownlint-cli2 'plugins/**/*.md' || true   # if you have it

format:
	@python3 -m json.tool .claude-plugin/marketplace.json > /tmp/m.json && mv /tmp/m.json .claude-plugin/marketplace.json
	@for f in plugins/*/.claude-plugin/plugin.json; do python3 -m json.tool "$$f" > /tmp/p.json && mv /tmp/p.json "$$f"; done

check: lint-skills-strict lint-md

ci: check
```

## See also

- [`ci-integration.md`](../references/ci-integration.md) — broader integration story (pre-commit hook, GitHub Actions workflow, other CI systems).
