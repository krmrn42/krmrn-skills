# Convention: workspace layout

The host project's filesystem layout for requirements artifacts. **Slug-driven, with numeric prefixing at the initiative level** for chronological ordering. Inside an initiative, slugs alone are unambiguous because counts are small.

## Layout

```
./                                        # workspace root (host project root)
├── AGENTS.md                              # standing-store paths/URLs (read by runbooks)
├── 001-semantic-search/
│   ├── exploration.md
│   ├── prd.md
│   ├── jira-connector/
│   │   ├── epic.md
│   │   └── stories/
│   │       ├── oauth-flow.md
│   │       ├── search-endpoint.md
│   │       └── result-ranking.md
│   └── confluence-connector/
│       ├── epic.md
│       └── stories/
│           └── page-crawl.md
├── 002-agent-marketplace-billing/
│   └── ...
└── archive/
    └── 000-feature-flag-platform/
        └── ...
```

## Rules

### 1. Active initiatives sit at the workspace root

As `{NNN}-{initiative-slug}` directories. `NNN` is **three digits** (001, 002, …) to accommodate ~1000 initiatives. If outgrown, a one-time pad to four digits — done across the whole workspace at once.

### 2. Archived initiatives move to `archive/`

When the PRD reaches `Status: Archived`, the **whole initiative directory** moves into `archive/` as one operation. The archive boundary is the **only** lifecycle directory — finer-grained status stays as a frontmatter field on each artifact.

The initiative keeps its number when archived (no renumbering on archive).

### 3. Numbering reflects entry sequence, not priority

New initiatives take the next number even if they logically slot earlier. **Never renumber** — renumbering breaks parent-chain links and git history.

### 4. Each epic is a directory

Named for its slug. Inside it:

- `epic.md` — the epic document.
- `stories/` — the epic's stories as flat files.

This co-locates an epic with its stories while leaving room for additional artifact types (e.g., `plan.md`, `decisions/`, `design/`) to be introduced later without colliding with the story namespace.

### 5. Story files are flat under `stories/`

`{story-slug}.md`. Stories have no children, so no further nesting. **No order is encoded in filenames** — listings are alphabetical by slug. Hard requirements-side dependencies live in the Story's `Depends on:` frontmatter field. Implementation sequencing lives in the issue tracker, not in filenames.

### 6. Positive-identification rule for artifact types

Each artifact type has a **dedicated location**:

- PRD at `prd.md`
- Exploration at `exploration.md`
- Epic at `epic.md`
- Stories under `stories/`

New artifact types added in the future get their own dedicated location (e.g., `plan.md` or `decisions/`). The framework **never** relies on negation rules like "anything not named X is a Y" — that keeps the layout open to extension.

## Initiative-number allocation

`/prd` allocates the next number when starting a new initiative:

1. List directories matching `[0-9][0-9][0-9]-*` at the workspace root.
2. Also list directories matching `[0-9][0-9][0-9]-*` under `archive/`.
3. Take the max numeric prefix across both, increment by 1, zero-pad to 3.
4. If a directory with that number already exists (race), surface and stop.

If the PM re-invokes `/prd` against an existing initiative (slug matches an existing directory), the number is **not** reallocated — the runbook reuses the existing number and refines the existing artifacts.

## Path form recap

Parent links (frontmatter and inline) use **paths relative to the artifact's location**:

- From the PRD: `./exploration.md`
- From an Epic: `../prd.md`
- From a Story: `../epic.md` and `../../prd.md`

`/push` writes Tracker IDs into the same frontmatter; tracker URLs are absolute.
