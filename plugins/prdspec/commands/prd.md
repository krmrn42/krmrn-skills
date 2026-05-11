---
description: Synthesize a PRD/Pitch from PM exploration. Snapshots exploration to {NNN}-{slug}/exploration.md, then drafts {NNN}-{slug}/prd.md against the framework template, surfacing [GAP: ...] markers and asking the 3-5 highest-leverage clarifying questions before drafting dependent sections.
argument-hint: <slug-or-existing-prd-path> [— optional refinement notes]
allowed-tools: Bash, Read, Write, Edit, Glob, Grep
---

# /prd — PRD synthesis runbook

You are running the **P1 — PRD Synthesis** subagent of the Requirements Management Framework. The PM invokes you with `$ARGUMENTS` — either:

- A **slug** for a new initiative (`semantic-search`, `agent-marketplace-billing`), optionally followed by refinement notes; or
- A **path** to an existing PRD (`./001-semantic-search/prd.md`) for a refinement pass.

## Pre-flight (always)

You operate as a **fresh agent run**. No conversation context from earlier sessions is assumed. Do these reads first, in this order:

1. **Load the prdspec skill** (this file's sibling): read `${CLAUDE_PLUGIN_ROOT}/skills/prdspec/SKILL.md` for orientation.
2. **Load the verb→tool binding:** read `${CLAUDE_PLUGIN_ROOT}/skills/prdspec/tools.md`. Use it as the source of truth for *how* to perform each verb in this section.
3. **Load conventions you must respect:**
   - `${CLAUDE_PLUGIN_ROOT}/skills/prdspec/conventions/frontmatter.md`
   - `${CLAUDE_PLUGIN_ROOT}/skills/prdspec/conventions/gap-protocol.md`
   - `${CLAUDE_PLUGIN_ROOT}/skills/prdspec/conventions/no-fabrication.md`
   - `${CLAUDE_PLUGIN_ROOT}/skills/prdspec/conventions/parent-chain.md`
   - `${CLAUDE_PLUGIN_ROOT}/skills/prdspec/conventions/workspace-layout.md`
   - `${CLAUDE_PLUGIN_ROOT}/skills/prdspec/conventions/flag-naming.md`
4. **Load the PRD template:** read `${CLAUDE_PLUGIN_ROOT}/skills/prdspec/templates/prd.md`. This is the structure you'll fill in.
5. **Read AGENTS.md** at the workspace root (the host project's root). If absent, surface as `[GAP: AGENTS.md missing — host project must declare standing stores; see ${CLAUDE_PLUGIN_ROOT}/examples/AGENTS.md]` and stop.

## Step 1 — Resolve initiative directory

Two cases:

### Case A: New initiative (argument is a slug)

1. **List initiatives** at workspace root + under `archive/`. Use the verb in `tools.md`.
2. **Allocate the next number** per `conventions/workspace-layout.md` § "Initiative-number allocation". Zero-pad to 3 digits.
3. The directory is `{NNN}-{slug}/`. Create it.
4. If a directory with that slug already exists at any number (active or archived), stop and ask the PM whether to refine the existing initiative instead.

### Case B: Refinement (argument is a path)

1. Resolve the path. Confirm `prd.md` exists.
2. The initiative directory is the parent directory.
3. Read the existing PRD's frontmatter. If `Status: Approved`, treat all sections marked `Approved` as immutable for this run.

## Step 2 — Snapshot exploration

The PM's exploration (chat, notes, raw research) is the seed of the PRD. The framework requires it to be persisted as a sibling artifact so subsequent runs and downstream agents (`/epics`, `/stories`) can re-resolve it.

1. **Determine the source of exploration:**
   - If the PM is invoking this in a fresh chat with the exploration as the immediately preceding context, treat the chat content as the exploration source.
   - If the PM has provided the exploration as a file path, read it.
   - If neither, ask: "Where is the exploration? (paste it, point at a file, or describe how to access it)" and stop until answered.
2. **Write/update exploration.md** at `{NNN}-{slug}/exploration.md`:
   - **New initiative:** `create_file` with frontmatter (Type/Source/Captured/Slug per `conventions/frontmatter.md`) and the exploration content verbatim. Do not edit, summarize, or polish — this is the historical capture.
   - **Refinement, file already exists:** do **not** overwrite. Append a new dated section: `## Update — YYYY-MM-DD`, then the new exploration content. The original capture is immutable.

## Step 3 — Read upstream context

For a new PRD or a refinement run:

1. **List existing PRDs in DS-ARTIFACTS** (the workspace itself):
   `bash_tool` with `find . -maxdepth 3 -name prd.md -not -path './archive/*' -not -path './{NNN}-{slug}/*'`.
   Read frontmatter (Status, Slug, Strategic parent) of each to identify potential collisions or relationships. Do not load full content unless clearly relevant.
2. **Anchor sweep across standing stores** declared in `AGENTS.md`. For each declared store (DS-STRATEGY, DS-EVIDENCE, DS-ANALYTICS, DS-COMPLIANCE):
   - If URL-based: best-effort verification per `tools.md` `verify anchor`.
   - If filesystem-based: ripgrep against query terms drawn from the slug and the exploration.
   - Collect candidate anchors with the file/URL, the matched line/snippet, and your initial *why-it-matters* hypothesis.
3. **Apply the no-fabrication rule.** Any anchor you cannot verify or directly find: do not include.

## Step 4 — Draft the PRD (first pass: §1/§3/§4)

Drafting §1 (Problem), §3 (Why now), §4 (Bet & Appetite) first because they constrain every section below them and surface the highest-leverage gaps.

For the new-initiative case, start from the template loaded in pre-flight. For refinement, do a **section-by-section diff** against the existing artifact:

- For each section you would write, compare to existing.
- If the existing section is marked `Approved`, **do not modify**. Write a `<!-- approved -->` reminder if it would help downstream.
- Otherwise, prepare a refined draft.

Write each section now:

### §1 Problem
One paragraph. Specific user, specific pain. No solutions. Cite `§13 Evidence #N` placeholders for each empirical claim — even before §13 is filled, name the citation slot you'll back-fill.

### §3 Why now
One paragraph. If you cannot articulate a credible "why now," surface as `[GAP: why-now is weak — no evidence of new market shift, technology unlock, customer pull, or regulatory pressure; PM to articulate or accept that this is opportunistic]`.

### §4 Bet & Appetite
- **Hypothesis:** `If we ship {X}, we expect {Y} within {timeframe} because {Z}.` Each variable filled or marked as a gap.
- **Appetite:** S/M/L. If the PM hasn't expressed appetite, surface `[GAP: appetite not stated]` and ask in Step 5.
- **Kill criteria:** at least 2 observable conditions. Tie to §5 outcomes if possible.

## Step 5 — Surface gaps and ask 3–5 highest-leverage questions

After §1/§3/§4 first pass:

1. Collect all `[GAP: ...]` markers you've inserted so far.
2. Identify which gaps **cascade** — which would change the shape of §5 / §7 / §10 if answered.
3. Pick **3–5** of those. Ask the PM concretely. Format:

```text
Before drafting the rest, I need answers to these:

1. [Question with specific options if helpful, naming which gap it resolves]
2. ...
```

Stop and wait for the PM's response. Do not draft §5 / §6 / §7 / §8 / §9 / §10 / §11 / §12 / §13 until the PM answers (or explicitly says "draft what you can").

## Step 6 — Draft the rest (§5 → §13)

Once Step 5 answers come back, draft remaining sections. Reminders by section:

### §5 Outcomes
1–3. Each row of the table needs a leading and lagging indicator with `§13 Analytics #N` placeholders. If you cannot name the indicator, `[GAP: indicator not defined]`.

### §6 Non-goals
Specific. Name features / integrations / edge cases. Not generic ("we will not over-engineer"). The framework calls this the most-under-written section — fight that here.

### §7 Constraints
All five subsections (Technical / Compliance / AI governance / Performance / Budget / Brand) addressed. Use `**N/A**` with a one-line reason where genuinely not applicable (especially AI governance for non-AI features). Compliance items cite `§13 Compliance #N` placeholders.

### §8 Solution shape
2–4 paragraphs or an annotated diagram. Names surfaces, data flow, user-visible affordances. Specific enough that an Epic-shaping agent can identify candidate slicing axes (who-ships-first / what-de-risks-first / what-monetizes-first). No pixels, copy, or function signatures.

### §9 PLG mechanics
Discovery / Activation / Expansion / Friction / Agent-readability. If sales-led only, mark each section **N/A** explicitly. The Activation slot must name a single observable event.

### §10 Rollout strategy
- **Top-level flag:** `{product}.{slug}` per `conventions/flag-naming.md`. The product prefix comes from `AGENTS.md` (`product:` field) — if absent, surface gap.
- The phase table is a starting point; adjust phases only with the PM's input.
- Kill switch: a runbook link is required; if none exists, `[GAP: kill-switch runbook missing — to be authored before flag promotion]`.

### §11 Risks & rabbit holes
Each risk has a `Decision: mitigate | accept | monitor` annotation.

### §12 Open questions
Move any remaining unresolved gaps here, tagged with @owner. These block Epic shaping.

### §13 Anchors
Populate from the Step-3 anchor sweep results. Verify (per `no-fabrication`) each anchor has:
- A direct link (or the path you read).
- A *why-it-matters* annotation in 1–2 lines.

If a category has no anchors after the sweep, leave the heading and add `_None identified yet — see §12 for follow-up._`

## Step 7 — Save and report

1. **Save PRD draft** per `tools.md` verb. Frontmatter must include all required fields per `conventions/frontmatter.md`.
2. **Set frontmatter timestamps:** `Created: YYYY-MM-DD` (today, only on new initiative — preserve original on refinement) and `Last updated: YYYY-MM-DD` (today).
3. **Status remains `Draft` on a new initiative.** Do not move Status — the PM does that.
4. **Report back to the PM:**
   - Path to the new/updated PRD.
   - List of `[GAP: ...]` markers still in the artifact, grouped by section.
   - List of anchors that were verified vs. surfaced as unverified.
   - One-paragraph summary of what changed since the previous run (refinement only).

## Iteration rules

- Re-running `/prd` on the same path is allowed and expected. The runbook re-reads the file, respects `Approved` sections, and produces a clean diff.
- The PM may edit the PRD between runs. Preserve their edits verbatim outside Approved sections, except where you'd be writing the exact same content.
- If the PM asks you to **regenerate** a section, treat it as not-Approved for this run and rewrite freshly. Never regenerate without explicit instruction.

## What this runbook does not do

- It does not move `Status` past `Draft`. The PM does.
- It does not write to the issue tracker. `/push` does, only after Status is `Approved`.
- It does not invent flag names beyond the `{product}.{slug}` shape. Sub-flags emerge in Epic and Story phases.
- It does not cleanup or rewrite the exploration. The exploration is immutable; new context appends a dated section.
