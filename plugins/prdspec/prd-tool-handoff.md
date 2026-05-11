# Requirements Management Skill — Project Handoff

## What we're building

A **Claude skill** that implements the Requirements Management Framework — an opinionated, agent-driven process for moving from PM exploration through PRDs, Epics, and User Stories into the issue tracker.

The framework itself is defined in a separate document: **`requirements-framework.md`** (uploaded earlier in the conversation that produced this handoff). That document is the source of truth for the *process*; this handoff covers the *implementation strategy*.

## Why a skill (and not an MCP, yet)

We considered three shapes: a SaaS service with MCP, a hybrid library + MCP, and a pure skill. We landed on **skill-first** because:

- The framework is unusually well-defined for a skill — every discipline (gap protocol, no fabrication, parent chain, immutability) is statable as a runbook rule.
- A skill ships in a week with zero infrastructure. An MCP server adds deploy/maintain surface.
- The "fresh agent run" principle in the framework already provides most of the safety MCP would enforce server-side.
- The user we're building for (our internal PM) is willing to adopt a workflow change. He doesn't need server-side enforcement on day one.

### The constraint we accept

Skill-only requires the agent to have filesystem and shell access. That means:
- ✅ **Claude Code** — works.
- ✅ **Cowork** — works.
- ✅ **Claude Desktop** with a filesystem MCP connector — works.
- ❌ **Claude web** — does not work.

We accept this. The PM moves to Claude Code or Cowork for requirements work. (Cowork is probably the better fit for non-developer PM workflows.)

### The migration path to MCP

We architect the skill so that swapping to MCP later is a **single-file rewrite**. See "Tool abstraction" below. The first MCP we'll likely ship is for `/push` only (Jira API integration is inherently service-bound), keeping the rest as skill.

## Architecture: tool-agnostic skill

The key design decision is to write subagent runbooks in terms of **intent verbs**, not tool names. The runbook says "load the parent PRD," not "use `view` on `./prds/{slug}.md`." All tool-binding happens in one file: `tools.md`.

### Skill folder structure

```
.claude/skills/requirements/
├── SKILL.md                       # Top-level entry: when to use, points to subskills
├── tools.md                       # ⭐ Verb → tool binding (the only file that changes for MCP)
├── conventions/                   # Pure docs — stable across backends
│   ├── frontmatter.md             # Status field, slug rules, parent links
│   ├── gap-protocol.md            # [GAP: ...] discipline
│   ├── no-fabrication.md          # Anchor verification rules
│   ├── parent-chain.md            # How to walk parent: fields
│   └── flag-naming.md             # Feature flag naming + lifecycle
├── templates/                     # Templates from the framework doc
│   ├── prd.md                     # Template 1 — Pitch (PRD)
│   ├── epic.md                    # Template 2 — Epic
│   └── story.md                   # Template 3 — User Story
├── prd/SKILL.md                   # /prd subagent runbook (tool-agnostic)
├── epics/SKILL.md                 # /epics subagent runbook
├── stories/SKILL.md               # /stories subagent runbook
└── push/SKILL.md                  # /push subagent runbook
```

## Tool abstraction pattern

### Runbooks reference verbs

```markdown
# /prd subagent

When invoked:
1. **Snapshot the exploration** to a stable file.
2. **Load the PRD template.**
3. For each anchor section, **verify the anchor** before including it; if 
   unverified, surface as `[GAP: anchor unverified]`.
4. **Search standing stores** for relevant prior art.
5. Draft §1, §3, §4. Ask 3–5 highest-leverage questions. Then draft §5, §6, §7.
6. **Save the PRD draft.**

Refer to `tools.md` for how each verb is performed in this environment.
```

### `tools.md` (filesystem backend, today)

| Verb | Implementation |
|---|---|
| **snapshot exploration** | `create_file` → `./exploration/{slug}.md` |
| **load template** | `view` on `.claude/skills/requirements/templates/{name}.md` |
| **verify anchor** | `bash_tool` with `curl -I` — best-effort; on non-2xx surface as gap |
| **search standing stores** | Read `AGENTS.md` for paths; `bash_tool` with `rg` |
| **load parent** | Read frontmatter `parent:` field; `view` the path |
| **save PRD draft** | `create_file` → `./prds/{slug}.md`. If exists, `str_replace` per-section, respecting `Approved` sections in frontmatter |
| **search codebase** | `bash_tool` with `rg` over paths in `AGENTS.md` |

### `tools.md` after MCP ships (future state)

| Verb | Implementation |
|---|---|
| **snapshot exploration** | `requirements:prd_snapshot_exploration(content)` |
| **load template** | `requirements:templates_read(name)` |
| **verify anchor** | `requirements:anchors_verify(url)` (server-enforced) |
| **search standing stores** | `requirements:stores_search(query, store_ids[])` |
| **load parent** | `requirements:artifact_load_parent(type, slug)` |
| **save PRD draft** | `requirements:prd_save(slug, content)` (server enforces approved-section immutability) |
| **search codebase** | `requirements:code_search(pattern)` |

When the MCP exists, only `tools.md` changes. Runbooks, conventions, and templates remain untouched.

### What migrates cleanly vs not

**Migrates cleanly:** all four runbooks, all conventions, all templates, gap protocol, parent-chain pattern, status semantics. These describe *what to do*, not *how*.

**Shifts in semantics (acceptable):**
- *Anchor verification:* today best-effort and Claude can fabricate confidently; with MCP the server actually checks. Runbook instruction is identical; result quality improves.
- *Approved-section immutability:* today by convention (Claude refuses and explains); with MCP enforced server-side. User-visible behavior identical.

## MVP scope

Narrow ruthlessly to the four subagents and three artifacts the framework defines.

### In MVP
1. The four subagent runbooks: `/prd`, `/epics`, `/stories`, `/push`.
2. The three templates from the framework doc: PRD, Epic, Story.
3. Conventions: frontmatter schema, gap protocol, no-fabrication, parent-chain, flag-naming.
4. `tools.md` for filesystem backend.
5. A minimal `AGENTS.md` example for a host project, showing how to point at standing stores.
6. Jira-only `/push` integration (skip Linear/GitHub Projects for v1).

### Explicitly NOT in MVP
- MCP server. The skill is the deliverable.
- Web UI for the PM.
- Multi-tenant anything.
- Anchor health-check tooling beyond best-effort `curl -I`.
- Linear/GitHub Projects support in `/push`.
- A separate validation CLI (Claude Code `bash_tool` is the test runner).
- Sub-flag generation logic beyond what the framework spec already defines.

## Sequencing for build

Recommended order (each step yields something testable):

1. **`templates/prd.md`** — copy verbatim from the framework doc Template 1. Same for `epic.md` and `story.md`.
2. **`conventions/*.md`** — extract from the framework doc. Each file is a focused rule sheet.
3. **`tools.md`** — write the filesystem backend table.
4. **`prd/SKILL.md`** — first runbook. Test against a real exploration from the internal PM.
5. **`epics/SKILL.md`** — covers both explore and direct modes.
6. **`stories/SKILL.md`** — most engineering-coupled; needs ripgrep integration via `tools.md`.
7. **`push/SKILL.md`** — Jira API via `bash_tool` with `curl` for v1; this is the natural future MCP candidate.
8. **Top-level `SKILL.md`** — the routing layer that tells Claude when to invoke which subskill.
9. **Internal pilot** with the PM. One real PRD, one real Epic, one real Story set, one real `/push` to Jira. Capture friction.

## Open questions to resolve in Claude Code

- **Slug derivation:** kebab-case from PRD title? From the first noun phrase? Should `/prd` ask the PM to confirm slug, or pick and let them rename?
- **Section IDs for stable linking:** the framework uses §-numbered sections (`PRD §7`, `Epic §5`). Are those stable enough as IDs, or do we need explicit anchor IDs in frontmatter for each section? (Risk: PM reorders sections, links break.)
- **AGENTS.md schema:** how does the host project declare its standing-store paths? Specifically: how do we point at DS-EVIDENCE (call recordings outside the repo)? Do we accept URLs only, or document that some stores require manual snippet copy-paste?
- **Iteration UX:** when the PM re-invokes `/prd` on an existing draft, should the runbook diff against the previous version and surface what's changing? Or just rewrite and rely on git for diff?
- **Naming of the project itself:** working title TBD. Possibilities to consider: "Specforge," "Pitchcraft," "RM-Skill," something framework-specific. Decide before the first commit.
- **License:** MIT vs Apache 2.0. Apache if we expect to add MCP server with patentable mechanics later; MIT for maximum adoption.

## Open-source posture

- Build for our internal company first; architect from day one for community use.
- Permissive license, clean repo, framework spec as the portable artifact.
- The MCP migration becomes the eventual commercial wedge (hosted service, multi-tenant, server-side enforcement of anchor verification and immutability).
- Keep the skill itself permanent and free; later commercial value is in the hosted backend that swaps in via `tools.md`.

## Existing landscape (already surveyed)

- **OpenSpec** (Fission-AI) — engineering-side spec-driven dev, brownfield iteration. CLI-first; community has retrofitted MCP wrappers (`Lumiaqian/openspec-mcp`, `openspec-mcp` on PyPI). Targets the layer *below* what we're building.
- **Spec Kit** (GitHub) — heavier, phase-gated, greenfield-leaning. Also engineering-side.
- **Doorstop** — requirements as YAML in Git with traceability tree. Engineering-focused, not PM-friendly.
- **BMAD** — agentic planning for high-fidelity requirements. Heavyweight, agent-orchestrator-shaped.
- **Tessl** — spec-as-maintained-artifact platform.

**Gap we fill:** none target the *PM authoring + cross-team handoff* layer with agent-first granular access and a fresh-agent-run discipline. Our framework is opinionated specifically about what the PM hands off, and our skill is the executable form of that opinion.

## Reference

- `requirements-framework.md` (uploaded) — the framework spec. Templates, conventions, subagent design notes, DFD, and "what this framework deliberately does not do" all live there. This handoff covers only the *implementation strategy*; for any question about *what* the system does, defer to the framework doc.
