.PHONY: help lint-skills lint-skills-strict ci

help:
	@echo "Targets:"
	@echo "  lint-skills          Run skill-linting (warnings non-blocking)"
	@echo "  lint-skills-strict   Run skill-linting (warnings = failures)"
	@echo "  ci                   Full CI suite — currently aligned with pre-commit (errors only)."

lint-skills:
	@python3 plugins/skill-linting/scripts/lint.py

lint-skills-strict:
	@python3 plugins/skill-linting/scripts/lint.py --strict

ci: lint-skills
