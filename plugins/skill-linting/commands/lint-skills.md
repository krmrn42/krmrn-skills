---
description: Run skill-linting structural checks against this marketplace
argument-hint: "[plugin-or-skill-path]"
---

Run the skill-linting structural checks.

Invoke the linter at `${CLAUDE_PLUGIN_ROOT}/scripts/lint.py` using `python3`. Pass through the user's argument as the path to lint:

- If the user provided a path argument: lint just that path (a plugin directory like `plugins/architecture` or a skill directory like `plugins/architecture/skills/architecture-review`).
- If no argument was provided: lint everything (no path argument to the script).

Run the script with the default human-readable output format. If the linter exits non-zero, surface its findings to the user verbatim and explain what to fix using the rule IDs as keys into `references/checks-reference.md`. If it exits zero, report "no findings" briefly.

Use `Bash` to invoke:

```bash
python3 ${CLAUDE_PLUGIN_ROOT}/scripts/lint.py [path-or-empty]
```

Do not pass `--strict` or alternative formats unless the user asks for them — the slash command's purpose is the human-facing review surface; CI and pre-commit invoke the linter directly with their own flags.

After reporting findings, if any are present, offer to fix them — but do not auto-fix without confirmation. The two safe auto-fixes (TOC stub, keyword sort) are not yet implemented in `lint.py`; for now, every fix is manual.
