.PHONY: help lint-skills lint-skills-strict test-lint ci

help:
	@echo "Targets:"
	@echo "  lint-skills          Run skill-linting (warnings non-blocking)"
	@echo "  lint-skills-strict   Run skill-linting (warnings = failures)"
	@echo "  test-lint            Run stdlib unittests for skill-linting rule logic"
	@echo "  ci                   Full CI suite — lint (errors only) + lint unit tests."

lint-skills:
	@python3 plugins/skill-linting/scripts/lint.py

lint-skills-strict:
	@python3 plugins/skill-linting/scripts/lint.py --strict

test-lint:
	@python3 plugins/skill-linting/scripts/test_lint.py

ci: lint-skills test-lint
