# krmrn-skills

A community marketplace of Claude Code skills and plugins.

This is the **public** companion to a smaller private marketplace. Skills graduate here once they're stable, generally useful, and reviewed.

## Install

```bash
# In a Claude Code session:
/plugin marketplace add krmrn42/krmrn-skills
/plugin install skill-linting@krmrn-skills
```

For local development (after cloning):

```bash
/plugin marketplace add /path/to/krmrn-skills
```

## Plugins

| Plugin | What it does |
|---|---|
| [`skill-linting`](./plugins/skill-linting) | Zero-deps Python lint for Claude Code skills. Catches frontmatter, length-cap, manifest-sync, and reference-depth issues. Wires into a slash command (`/skill-linting:lint-skills`), a Makefile target (`make lint-skills`), and pre-commit. |
| [`chat-search`](./plugins/chat-search) | Cross-project full-text search across local Claude Code conversations. Maintains its own SQLite FTS5 index built from the JSONL files Claude Code keeps under `~/.claude/projects/`. Three surfaces — CLI `multivac`, built-in TUI picker (`multivac -i`), and the slash command `/chat-search:find`. Enter resumes you in the conversation's original project directory. Also installable outside Claude Code via `npm install -g @krmrn42/multivac && multivac init`. Zero external dependencies; needs Node ≥ 22.5. |
| [`prdspec`](./plugins/prdspec) | Requirements Management Framework — PM exploration → Pitch (PRD) → Epics → User Stories → tracker push. Four slash commands (`/prd`, `/epics`, `/stories`, `/push`) and a shared skill (`prdspec`) that carries the templates and conventions. |

More plugins will land here over time. See [CONTRIBUTING.md](./CONTRIBUTING.md) for the bar.

## Recommended companion plugins

These plugins are *not* shipped here, but they're what most contributors will want installed alongside this marketplace when authoring skills. They're maintained by Anthropic or by adjacent community marketplaces.

| Plugin | Source | Why it's useful |
|---|---|---|
| `plugin-dev` | Anthropic (official) | Bundles `plugin-structure`, `skill-development`, `command-development`, `agent-development`, `hook-development`, `mcp-integration`, `plugin-settings`, and a guided `create-plugin` workflow. The reference for *how* to lay out a Claude Code plugin. |

A typical author's install set:

```bash
/plugin marketplace add krmrn42/krmrn-skills
/plugin install skill-linting@krmrn-skills

# Plus Anthropic's official skill-creator and plugin-dev — see Claude Code's
# /plugin marketplace browse output for current sources.
```

## Layout

```
.
├── .claude-plugin/marketplace.json    # marketplace manifest
├── plugins/
│   ├── skill-linting/
│   │   ├── .claude-plugin/plugin.json
│   │   ├── commands/lint-skills.md    # /skill-linting:lint-skills
│   │   ├── scripts/lint.py            # the linter (zero deps, Python 3.11+)
│   │   ├── scripts/test_lint.py       # stdlib unittests for rule logic
│   │   └── skills/skill-linting/
│   │       ├── SKILL.md
│   │       ├── references/
│   │       └── templates/
│   ├── chat-search/
│   │   ├── .claude-plugin/plugin.json
│   │   ├── CHANGELOG.md
│   │   ├── bin/                        # symlinks into packages/multivac/src/
│   │   │   ├── multivac → …/multivac.js
│   │   │   ├── indexer.js → …/indexer.js
│   │   │   └── picker.js  → …/picker.js
│   │   └── commands/
│   │       ├── find.md                # /chat-search:find
│   │       └── setup.md               # /chat-search:setup
│   └── prdspec/                       # /prd, /epics, /stories, /push
├── packages/
│   └── multivac/                       # @krmrn42/multivac npm package
│       ├── package.json
│       ├── README.md                   # npm-facing
│       ├── LICENSE
│       ├── NAMING.md                   # rename decision record
│       ├── src/
│       │   ├── multivac.js             # CLI entry (Node, zero deps)
│       │   ├── indexer.js              # JSONL → SQLite FTS5 indexer
│       │   └── picker.js               # built-in TUI picker
│       └── test/
│           └── multivac.test.sh        # fixture-DB smoke test
├── .github/workflows/                  # GitHub Actions (publish-multivac.yml)
├── Makefile                            # make lint-skills, lint-skills-strict, test-lint, ci
├── .pre-commit-config.yaml             # local hook invoking lint.py
├── .skill-lint.toml                    # repo-wide and per-skill lint config
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
└── LICENSE                             # MIT
```

Each plugin in `plugins/` is a self-contained directory referenced from `marketplace.json`. The single npm-publishable package lives in `packages/multivac/` — its sources are git-tracked symlinks from `plugins/chat-search/bin/`, so editing the canonical files under `packages/multivac/src/` updates both distribution channels. Versions in `packages/multivac/package.json`, `plugins/chat-search/.claude-plugin/plugin.json`, and the matching `marketplace.json` entry are kept in lockstep (enforced by the `marketplace.plugin.package-version-sync` lint rule).

See the [skill-authoring](https://github.com/krmrn42/skills/tree/main/plugins/authoring) skill for the full layout rules.

## Contributing

Read [CONTRIBUTING.md](./CONTRIBUTING.md). Short version:

1. Open an issue first for new plugins — we'd rather align on scope before you write a body.
2. Run `make lint-skills` before submitting. Tier-1 errors block; tier-2 warnings are advisory but should be justified in PR.
3. Every plugin must be self-contained, progressively disclosed, and have a description that triggers cleanly.

## License

[MIT](./LICENSE) — contributions accepted under the same license. By submitting a PR you agree your contribution is licensed under MIT.
