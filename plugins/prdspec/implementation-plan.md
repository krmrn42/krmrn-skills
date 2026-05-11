# prdspec — Phased Implementation Plan

> **Goal:** Ship a Claude Code plugin (in a single-plugin marketplace) that implements the Requirements Management Framework defined in `requirements-framework.md`. Four user-invoked entry points (`/prd`, `/epics`, `/stories`, `/push`) plus one shared knowledge skill (`prdspec`) carrying templates, conventions, and the verb→tool binding.

**Architecture:** Slash commands as explicit entry points (each is a tool-agnostic runbook), one shared skill that holds templates, conventions, and `tools.md` (the only file that needs to change when an MCP backend ships later). Filesystem backend for v1.

**Tech stack:** Markdown only — no scripts in v1. `bash_tool` with `rg`/`curl` is the runtime. Designed so the entire skill migrates to an MCP-backed implementation by editing `tools.md` alone.

---

## Repo + plugin layout

```
prdspec/
├── .claude-plugin/
│   └── marketplace.json
├── plugins/
│   └── prdspec/
│       ├── .claude-plugin/
│       │   └── plugin.json
│       ├── README.md
│       ├── commands/
│       │   ├── prd.md           # /prd
│       │   ├── epics.md         # /epics
│       │   ├── stories.md       # /stories
│       │   └── push.md          # /push
│       └── skills/
│           └── prdspec/
│               ├── SKILL.md
│               ├── tools.md
│               ├── conventions/
│               │   ├── frontmatter.md
│               │   ├── gap-protocol.md
│               │   ├── no-fabrication.md
│               │   ├── parent-chain.md
│               │   ├── flag-naming.md
│               │   └── workspace-layout.md
│               └── templates/
│                   ├── prd.md
│                   ├── epic.md
│                   └── story.md
├── examples/
│   └── AGENTS.md                # sample standing-stores config for host project
├── prd-tool-handoff.md          # existing
├── requirements-framework.md    # existing
├── implementation-plan.md       # this file
├── README.md
└── .gitignore
```

---

## Phase 0 — Repo bootstrap

**Files:**
- Create `README.md` (top-level usage)
- Create `.gitignore`
- Create `implementation-plan.md` (this file)

**Commit:** `chore: bootstrap prdspec repo with implementation plan`

---

## Phase 1 — Marketplace + plugin scaffolding

**Files:**
- `.claude-plugin/marketplace.json` — declares `prdspec` plugin
- `plugins/prdspec/.claude-plugin/plugin.json` — plugin manifest
- `plugins/prdspec/README.md` — plugin-level usage

**Verify:** `cat .claude-plugin/marketplace.json | jq .` returns valid JSON.

**Commit:** `feat(plugin): scaffold marketplace and plugin manifests`

---

## Phase 2 — Templates (verbatim from framework)

**Files (all under `plugins/prdspec/skills/prdspec/templates/`):**
- `prd.md` — copied from framework §Template 1
- `epic.md` — from framework §Template 2
- `story.md` — from framework §Template 3

These are **fenced-code template literals** — the runbooks extract the body and write it into the artifact.

**Commit:** `feat(templates): add PRD/Epic/Story templates from framework spec`

---

## Phase 3 — Conventions

**Files (all under `plugins/prdspec/skills/prdspec/conventions/`):**
- `frontmatter.md` — `Status` field semantics, slug rules, parent links, immutability of `Approved` sections
- `gap-protocol.md` — `[GAP: ...]` discipline; ask 3–5 highest-leverage questions before drafting dependent slots
- `no-fabrication.md` — anchor verification rules; surface unverified anchors as `[GAP: anchor unverified]`
- `parent-chain.md` — how to walk `parent:` fields up the chain, distinguishing inherited pointers from anchors
- `flag-naming.md` — `{prd_slug}.{epic_slug}[.{story_slug}]`, lifecycle states, cleanup discipline, sub-flag exception
- `workspace-layout.md` — `{NNN}-{slug}/` initiative directories, archive boundary, no-renumber rule, positive-identification

**Commit:** `feat(conventions): add framework rule sheets`

---

## Phase 4 — Shared skill + tools.md

**Files:**
- `plugins/prdspec/skills/prdspec/SKILL.md` — frontmatter (`name`, `description`), maps the framework, lists all bundled resources
- `plugins/prdspec/skills/prdspec/tools.md` — verb→tool binding table for the filesystem backend

`tools.md` is the ONLY file that changes when MCP ships later. Runbooks reference verbs only.

**Commit:** `feat(skill): add prdspec shared skill and verb→tool binding`

---

## Phase 5 — `/prd` command

**File:** `plugins/prdspec/commands/prd.md`

**Runbook contract (tool-agnostic):**
1. Resolve initiative directory: if existing PRD path provided, target it; else allocate `{NNN}-{slug}/` at workspace root.
2. **Snapshot exploration** to `{NNN}-{slug}/exploration.md` (refusing to lose context if file already has content).
3. **Load template** for PRD; **load conventions** for frontmatter, gap-protocol, no-fabrication.
4. **Search standing stores** declared in workspace `AGENTS.md` to populate §13 anchors.
5. Draft §1, §3, §4. Surface gaps. Ask 3–5 highest-leverage questions. Then draft §5/6/7/8/9/10/11/12/13.
6. Respect `Approved` sections (immutable for this run).
7. **Save PRD draft** to `{NNN}-{slug}/prd.md`.

**Commit:** `feat(prd): add /prd runbook for PRD synthesis`

---

## Phase 6 — `/epics` command

**File:** `plugins/prdspec/commands/epics.md`

**Runbook contract:** Two modes.
- **Explore (default):** propose 2–3 slicing strategies that differ on a real axis (who-ships-first / what-de-risks-first / what-monetizes-first).
- **Direct (named epic):** expand the named epic; call out what defers to siblings.

In both modes: load the parent PRD; populate §2 inherited PRD pointers explicitly (no "see parent"); search DS-ARCH / DS-CODE / DS-TRACKER / DS-FLAGS; write to `{NNN}-{slug}/{epic-slug}/epic.md`.

**Commit:** `feat(epics): add /epics runbook for epic shaping`

---

## Phase 7 — `/stories` command

**File:** `plugins/prdspec/commands/stories.md`

**Runbook contract:** Most engineering-coupled subagent.
- Load Epic and walk parent chain to PRD.
- Run ripgrep over DS-CODE paths (declared in `AGENTS.md`) to populate Story §4 Implementer Context.
- Pin curated subset of project knowledge (DS-STANDARDS / DS-ARCH / DS-VENDOR / DS-COMPLIANCE) into Story §10 anchors.
- Surface story-anchored evidence per §3 of the template.
- Write each story to `{NNN}-{slug}/{epic-slug}/stories/{story-slug}.md`.

**Commit:** `feat(stories): add /stories runbook for story decomposition`

---

## Phase 8 — `/push` command

**File:** `plugins/prdspec/commands/push.md`

**Runbook contract:** Pure transport. Read Epic + Stories; call Jira REST via `bash_tool` with `curl`; register flags in DS-FLAGS; write tracker IDs back into frontmatter. Never modify requirements — surface mismatches instead. Jira-only for v1; Linear/GitHub Projects deferred per handoff.

**Commit:** `feat(push): add /push runbook for tracker integration`

---

## Phase 9 — AGENTS.md example + top-level docs

**Files:**
- `examples/AGENTS.md` — host-project sample showing how to declare standing-store paths/URLs (DS-STRATEGY, DS-EVIDENCE, DS-ANALYTICS, DS-COMPLIANCE, DS-ARCH, DS-CODE, DS-STANDARDS, DS-VENDOR) and where DS-ARTIFACTS lives.
- Update `README.md` (top-level) with installation + getting-started.

**Commit:** `docs: add AGENTS.md example and usage guide`

---

## Acceptance for "ready to test"

After P9, the PM can:
1. Add this marketplace via `/plugin marketplace add <repo>` and install the `prdspec` plugin.
2. Drop an `AGENTS.md` (cribbed from `examples/`) into a host project.
3. Hand a chat exploration to `/prd <slug>` and get `001-<slug>/prd.md` + `001-<slug>/exploration.md`.
4. Iterate with `/epics`, `/stories`, `/push`.

## Out of scope for v1 (per handoff)

- MCP server (skill-first; `tools.md` migration path baked in)
- Linear / GitHub Projects support
- Anchor health-check tooling beyond best-effort `curl -I`
- Validation CLI (manual pilot is the test)
- Sub-flag generation logic beyond what the framework already specifies
