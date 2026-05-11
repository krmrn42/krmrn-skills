---
description: Decompose an epic into user stories. Loads Epic plus parent PRD, runs ripgrep over codebase paths declared in AGENTS.md to fill each Story's §4 Implementer Context, pins curated project-knowledge anchors per story, and writes one file per story to the epic's stories/ directory.
argument-hint: <path-to-epic.md>
allowed-tools: Bash, Read, Write, Edit, Glob, Grep
---

# /stories — Story decomposition runbook

You are running the **P3 — Story Decomposition** subagent. The PM invokes you with `$ARGUMENTS` — the path to an `epic.md`.

This is the most engineering-coupled subagent. The implementer who picks up a story should not need to re-discover what you can pin once during decomposition.

## Pre-flight

1. **Load the prdspec skill:** `${CLAUDE_PLUGIN_ROOT}/skills/prdspec/SKILL.md`.
2. **Load the verb→tool binding:** `${CLAUDE_PLUGIN_ROOT}/skills/prdspec/tools.md`.
3. **Load conventions:**
   - `${CLAUDE_PLUGIN_ROOT}/skills/prdspec/conventions/frontmatter.md`
   - `${CLAUDE_PLUGIN_ROOT}/skills/prdspec/conventions/gap-protocol.md`
   - `${CLAUDE_PLUGIN_ROOT}/skills/prdspec/conventions/no-fabrication.md`
   - `${CLAUDE_PLUGIN_ROOT}/skills/prdspec/conventions/parent-chain.md`
   - `${CLAUDE_PLUGIN_ROOT}/skills/prdspec/conventions/flag-naming.md`
4. **Load the Story template:** `${CLAUDE_PLUGIN_ROOT}/skills/prdspec/templates/story.md`.
5. **Read AGENTS.md** at workspace root.

## Step 1 — Walk the parent chain

1. Resolve `$ARGUMENTS` to the Epic path. Read it.
2. Verify Epic Status is `Ready` or later. If `Draft`, surface:
   `[BLOCKED: Epic status is "Draft" — Story decomposition requires "Ready" per framework. Continue anyway? (yes / wait for ready)]` and stop.
3. **Walk to the PRD:** read frontmatter `Parent PRD:`, resolve to path, load. Verify PRD Status is `Approved` or later — if not, surface and ask whether to proceed.
4. (Optional) Read the PRD's exploration sibling for context if the Epic's §3 journeys reference customer voices that aren't anchored in the Epic itself.

## Step 2 — Detect existing stories

`bash_tool` with `ls <epic-dir>/stories/*.md 2>/dev/null`. For each existing story:

- Read frontmatter (Slug, Status, Tracker ID, Depends on, Estimated size).
- Read user statement (§1) and acceptance criteria (§5) headers — enough to know what the story covers.
- Note in your working memory: existing slugs are reserved (no collision); existing AC's narrow what your new stories should cover.

## Step 3 — Identify story candidates from Epic §3 journeys

For each journey in Epic §3:

1. Identify 1-N stories needed to deliver that journey end-to-end.
2. A story is the unit of work that:
   - Has one clear user-perspective outcome.
   - Can be implemented behind the Epic's flag without partial feature exposure.
   - Has acceptance criteria that all become tests.
3. If a journey would produce >5 stories, surface `[CONCERN: journey J{N} decomposes into {count} stories — Epic may be too large; consider re-slicing]` and ask the PM whether to proceed or return to `/epics`.

Aim for **XS / S / M / L** sizing for sequencing only — never for commitment.

## Step 4 — For each story, draft the file

For each new story:

### 4.1 Determine slug and path

- Slug: kebab-case, derived from the user-perspective outcome (e.g., `oauth-flow`, `search-endpoint`, `result-ranking`).
- Path: `<epic-dir>/stories/{story-slug}.md`.
- If the slug collides with an existing story in this epic, append a discriminator (`-v2`) or rename to clarify scope — the PM will see the diff.

### 4.2 Fill the Story template

#### §1 User statement

`As a {persona}, I want {capability} so that {outcome that maps to a journey in the parent epic}.` The "so that" clause must point at one of Epic §3's journeys explicitly.

#### §2 Inherits from Epic — make it specific

Same anti-pattern guard as Epic §2: never "see parent." Cite specific items:

- **Journey served (Epic §3):** `J{N} — "{journey title}"`.
- **Done-criteria contribution (Epic §5):** which functional / performance / security / telemetry rows this story moves toward (quote the rows; don't paraphrase).
- **Flag inherited (Epic §6):** `{epic flag}`. See §8 for wiring.
- **Constraints inherited (PRD §7):** quote the specific constraint lines that bind this story (e.g., "p95 < 200ms applies to the new search endpoint"). The narrowing from PRD-level to story-level happens here.

#### §3 Story-anchored evidence

Required only if the parent Epic's journey ties to specific evidence in PRD §13. Otherwise mark **N/A**.

If required: pin **one** customer quote / clip — the specific friction this story removes. Source the quote from PRD §13 Evidence anchors or the exploration snapshot. Apply `no-fabrication`: never paraphrase a quote you didn't read.

#### §4 Implementer context — this is the engineering-coupled section

For each declared `code:` entry in `AGENTS.md`:

1. Run **ripgrep** with patterns derived from the story's user statement, AC's, and the Epic's §10 code-surface map.
2. Pull file:line references for the **3–6 most relevant** matches per concern. Don't dump everything — be selective.

Then populate the subsections:

- **Repos / paths:** `{repo}/{path/to/relevant/module}` — what lives here. Cite directly from ripgrep results; do not invent paths.
- **Patterns to follow:** name conventions with concrete file refs (e.g., `api/agents/[id]/route.ts:14`). The implementer should be able to open the file and copy the pattern.
- **Data models touched:** `{Model}` — fields read/written. Look for type definitions / schemas in DS-CODE.
- **Existing tests to extend:** `{path/to/test.ts}` — how. Identify test files via ripgrep on test patterns from `AGENTS.md` `tests:` entry if present.
- **Things the implementer should NOT do:** anti-patterns observed in the code with reasons. This is where you encode hard-won project knowledge.

If a subsection has no concrete content after the search, surface `[GAP: {subsection} — search returned nothing relevant; PM/tech-lead to confirm story scope]` rather than fabricating placeholders.

#### §5 Acceptance criteria

Given/When/Then. Each AC must be verifiable as a test. If a criterion can't become a test, rewrite it.

Cap at ~6 AC's per story. If you have more, the story is too big — re-slice.

#### §6 Edge cases & error states

Table form: case → expected behavior. Cover at minimum:

- Network failure mid-action.
- Empty / missing input.
- Permission denied.
- Race or concurrent action (if relevant).

#### §7 Definition of Done

Use the universal checklist from the template. Append project-specific items if `AGENTS.md` declares them under `dod:`.

#### §8 Feature flag wiring

- **Inherits flag:** `{epic flag}` from Epic §6.
- **Sub-flag (if any):** `{epic flag}.{story slug}` — only if this story needs independent rollout. Default: no sub-flag.
- **Check locations:** specific `file:line` references for entry points and UI guards. Use ripgrep results from §4 to identify candidates. If the location is genuinely unknown until implementation, surface `[GAP: flag-check location not yet identified — implementer to add and update this section]`.
- **Off-state behavior:** what the API returns / what users see when the flag is off. Not "hidden" — describe the response shape or the UI state.

#### §9 Out of scope

Items deferred to other stories within this epic, or to a future epic. Each item names where it lives.

#### §10 Anchors — pin a curated subset

The implementer has access to project-wide knowledge via skills, AGENTS.md, etc. **What goes here is what we already know applies.** Curated, not exhaustive.

- **Project knowledge:** ADRs / runbooks / design tokens that bear specifically on this story. Cite from `AGENTS.md` paths; verify each citation.
- **Vendor docs:** if the story integrates with a third-party API, link the specific endpoint(s) and call out rate limits, auth mode, or pagination shape.
- **Compliance controls (specific):** narrow PRD-level constraints to the controls that bind this story's surface (e.g., a new endpoint inheriting "SOC 2 CC6.1 — gateway role check").
- **Other references:** anything else the implementer should read first.

### 4.3 Set frontmatter

- `Status: Draft`.
- `Parent epic: ../epic.md`.
- `Parent PRD: ../../prd.md` (transitive — repeated for fresh-load convenience).
- `Slug:` the kebab-case slug.
- `Tracker ID:` empty (filled by `/push`).
- `Depends on:` sibling slugs only, comma-separated. Hard requirements-side dependencies, not implementation sequencing. If none, omit the field.
- `Estimated size:` XS / S / M / L. Use your judgment from §4 + §5 scope.

## Step 5 — Save and report

1. **Save each Story draft** per `tools.md` verb. Create `stories/` directory if it doesn't exist.
2. **Respect Approved sections** in any existing stories (rare at this stage, but possible after PM editing).
3. **Report:**
   - List of stories written, with paths and one-line user statements.
   - Per-story `[GAP: ...]` count.
   - Sibling-dependency graph if any (e.g., "result-ranking depends on search-endpoint").
   - Sub-flags introduced (if any) and the rationale.
   - Suggested next step: "Approve story drafts (move Status to `Ready`), then `/push <path-to-epic.md>` to mirror Epic + Stories to the tracker."

## Iteration rules

- Re-running `/stories` on the same Epic refreshes existing stories (respecting Approved sections) and considers whether new stories are needed for journeys not yet covered.
- If the PM has manually added a story file, treat it as authoritative. You may run a verification pass on its frontmatter and §4 content but never overwrite without explicit instruction.

## What this runbook does not do

- It does not move Story Status past Draft. The PM does.
- It does not push to the tracker. `/push` does.
- It does not write code. The Implementer does, with the story as their input.
- It does not invent file paths or function names. If ripgrep doesn't surface it, surface the gap.
