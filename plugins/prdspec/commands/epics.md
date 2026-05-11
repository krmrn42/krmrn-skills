---
description: Shape epics from an approved PRD. Two modes — explore (propose 2-3 slicing strategies that differ on a real axis: who-ships-first, what-de-risks-first, what-monetizes-first) and direct (expand a named epic). In both modes, populates inherited-PRD pointers explicitly and Epic anchors via search against architecture, code, tracker, and flag stores.
argument-hint: <path-to-prd.md> [— optional epic name for direct mode]
allowed-tools: Bash, Read, Write, Edit, Glob, Grep
---

# /epics — Epic shaping runbook

You are running the **P2 — Epic Shaping** subagent. The PM invokes you with `$ARGUMENTS` — the path to a PRD, optionally followed by the name of a specific epic to expand (direct mode).

## Pre-flight

1. **Load the prdspec skill:** read `${CLAUDE_PLUGIN_ROOT}/skills/prdspec/SKILL.md`.
2. **Load the verb→tool binding:** `${CLAUDE_PLUGIN_ROOT}/skills/prdspec/tools.md`.
3. **Load conventions:**
   - `${CLAUDE_PLUGIN_ROOT}/skills/prdspec/conventions/frontmatter.md`
   - `${CLAUDE_PLUGIN_ROOT}/skills/prdspec/conventions/gap-protocol.md`
   - `${CLAUDE_PLUGIN_ROOT}/skills/prdspec/conventions/no-fabrication.md`
   - `${CLAUDE_PLUGIN_ROOT}/skills/prdspec/conventions/parent-chain.md`
   - `${CLAUDE_PLUGIN_ROOT}/skills/prdspec/conventions/flag-naming.md`
4. **Load the Epic template:** `${CLAUDE_PLUGIN_ROOT}/skills/prdspec/templates/epic.md`.
5. **Read AGENTS.md** at the workspace root.

## Step 1 — Resolve and load the parent PRD

1. Resolve `$ARGUMENTS` to the PRD path. If it doesn't end in `prd.md`, surface and stop.
2. Read the PRD. Verify `Status` is `Approved` (or later — `Active`/`Shipped`/`Archived`). If `Status: Draft` or `In review`, surface:
   `[BLOCKED: PRD status is "{status}" — Epic shaping requires Approved PRD per framework. Continue anyway? (yes / wait for approval)]` and stop until the PM responds.
3. Read the PRD's exploration sibling (`./exploration.md`) for context. Don't quote it; just understand it.
4. Note the **slug** and **initiative directory** from frontmatter.

## Step 2 — Detect existing epics in this initiative

`bash_tool` with `find <initiative-dir> -maxdepth 2 -name epic.md`. For each:

- Read frontmatter (Slug, Status, Tracker ID, Target rollout window).
- Note in your working memory; you'll reference these in `§10 In-flight context` of any new epic that touches the same surfaces.
- Use this list to detect collisions if the PM names an epic in direct mode that already exists.

## Step 3 — Anchor sweep across architecture / code / tracker / flag stores

Per `AGENTS.md`:

- **DS-ARCH:** ripgrep over architecture-doc paths for slugs from PRD §8 Solution shape and §7 Constraints. Collect ADRs and diagrams that inform component boundaries.
- **DS-CODE:** ripgrep for service-name and module-name candidates implied by §8. Aim for the **services touched at high level** — deep refs come in `/stories`.
- **DS-TRACKER:** if the tracker is reachable (per `AGENTS.md` `tracker:` config), list active epics in the same product area. If unreachable, surface `[GAP: tracker not reachable — in-flight epics not surfaced; PM to manually note]`.
- **DS-FLAGS:** identify the namespace this PRD's top-level flag claims (`{product}.{slug}.*`). Note any pre-existing flags in that namespace.

Apply `no-fabrication` rigorously. Anything you cannot verify becomes a `[GAP: anchor unverified ...]`.

## Step 4 — Choose mode

### Explore mode (no epic name in `$ARGUMENTS`)

Propose **2–3 slicing strategies**. They MUST differ on a real axis:

- **Who ships first** — e.g., enterprise vs. self-serve; persona A vs. persona B.
- **What de-risks first** — e.g., the scariest technical unknown; the highest-uncertainty UX assumption.
- **What monetizes first** — e.g., the slice that drives upgrade events; the slice that opens a new SKU.

Refuse to produce three variants of the same slicing (e.g., "ship search first / search + filters / search + filters + ranking" all on the same axis — that's iteration depth, not slicing strategy). If only one axis is meaningful for this PRD, propose **2 strategies on that axis** plus a **"do everything as one epic, don't slice"** option (which is rarely right but makes the trade-off visible).

For each strategy:

```markdown
### Strategy: {one-line label}

**Axis:** who-ships-first / what-de-risks-first / what-monetizes-first
**Slice 1 — Epic: `{epic-slug-1}`**
- Release-note one-liner.
- What's in it: 1–2 sentences.
- What's deferred: 1 sentence.

**Slice 2 — Epic: `{epic-slug-2}`**
...

**Why this strategy:** 1–2 sentences tying it back to PRD §4 Bet, §5 Outcomes, or §10 Rollout.
**Risks:** 1–2 sentences naming what this slicing makes harder.
```

Then ask the PM:

```text
Which strategy do you want to pursue? (1 / 2 / 3 / another round / mix-and-match)
- If you pick a strategy, I'll generate epic.md drafts for each slice in that strategy.
- If "mix-and-match", tell me which slices from which strategies.
- If "another round", tell me what's missing.
```

Stop. Wait for the PM's choice. Do not write any `epic.md` yet.

### Direct mode (epic name supplied)

Skip the strategy proposal. Confirm the named epic is consistent with the PRD's solution shape; if it isn't, ask:

```text
The epic "{epic-name}" doesn't appear to map cleanly to PRD §8 Solution
shape. Specifically: {what's missing or contradicted}. Do you want to:
1. Adjust the PRD §8 first.
2. Proceed and treat this epic as a new shape decision (must be called
   out in epic §4).
3. Revise the epic name.
```

Once aligned, expand the named epic per Step 5.

## Step 5 — Draft each chosen epic

For each epic to write (one in direct mode; multiple if the PM picks an explore-mode strategy):

1. **Determine the epic directory:** `<initiative-dir>/{epic-slug}/`. Create if missing.
2. **Determine target file:** `<initiative-dir>/{epic-slug}/epic.md`.
3. **Check for existing file.** If it exists:
   - Read frontmatter and respect `Approved` sections.
   - Diff against the new draft section by section.
4. **Fill the Epic template (`templates/epic.md`):**

### §1 What ships
- One-line **release note** that passes the press-release test. If you cannot articulate a saleable user-visible value in one sentence, surface `[GAP: increment is not saleable — re-slice]` and stop on this epic.
- 1–2 paragraphs of context for someone who won't read the PRD.

### §2 Inherits from PRD — make this **specific**, not "see parent"

The §2 section is the contract that lets a fresh `/stories` agent scope correctly without rereading the entire PRD. Cite **specific items** from the PRD:

- **Outcome served (PRD §5):** name the outcome (#N — "outcome name") and what fraction this epic delivers vs. siblings.
- **Constraints that bind (PRD §7):** quote the specific constraint lines (e.g., "p95 latency < 200ms"), don't summarize.
- **Non-goals reaffirmed (PRD §6):** which non-goals are particularly tempting to violate inside this epic. Be honest — if all PRD non-goals apply uniformly, list them all and say "all apply uniformly."
- **Bet & kill criteria (PRD §4):** restate the hypothesis fragment this epic tests; restate the kill criteria that apply at this epic's checkpoint.

If §2 reads like "see parent," **rewrite it.**

### §3 User journeys included

Each journey is `{persona} {goal} → {outcome}` plus a short list of story candidates. Don't enumerate stories — that's `/stories`'s job. Just name the journey.

### §4 Solution shape (this epic)

The slice of PRD §8 that applies. If this epic introduces shape decisions **not in the PRD**, name them explicitly in this section so they're reviewable.

Pin design artifacts here (Figma, prototypes). If the PM hasn't pointed at design files, surface `[GAP: design artifacts not pinned — required before /stories]`.

### §5 Done criteria

Functional / Performance / Security & compliance / Telemetry / Documentation. Each row is observable. If you can't make a row observable, rewrite it. Compliance items inherit from PRD §7 (see §2) but must narrow to *this epic's* surface.

### §6 Feature flag plan

- **Flag name:** `{prd_slug}.{epic_slug}` per `conventions/flag-naming.md` (translate slugs to snake_case for the flag identifier).
- **Default:** `off`.
- **Owner:** PM or named tech-lead from frontmatter.
- **Cleanup ticket:** placeholder until `/push` registers it. `[Tracker ID: {pending until /push}]`.
- **Per-phase entry criteria:** "Inherits PRD §10" unless this epic ships on a different cadence (in which case spell out the override).
- **Kill switch behavior:** specific user-visible behavior when flag flips off — not just "hidden." Verified by a named test (placeholder if test not yet written: `[GAP: kill-switch test not yet authored]`).

### §7 Dependencies

- **Blocking us:** other epics, infra work, third-party API changes, design system components.
- **Blocked by us:** what we'll deliver to other epics.
- **External:** vendors, legal review, security review.

### §8 Out of scope

Items deferred. Cite which sibling epic / future PRD owns them.

### §9 Telemetry & success metrics

Events / Dashboards / Success thresholds / Review cadence. The events you name here become Story §7 DoD checkpoints — be specific (event name, payload shape, where fired).

### §10 Anchors

- **Architecture:** ADR refs and diagrams from Step-3 sweep, with *why-it-matters*.
- **Code-surface map:** services this epic touches at high level (deep file refs go to Stories).
- **In-flight context:** active sibling epics from Step 2 with coordination notes.
- **Flag namespace:** restate `{prd_slug}.{epic_slug}.*`. Note any sub-flags expected.

## Step 6 — Save and report

1. **Save Epic draft(s)** per `tools.md` verb. One epic per file.
2. **Frontmatter:** `Status: Draft`, `Parent PRD: ../prd.md`, `Tracker ID:` empty (filled by `/push`), DRI/Tech-lead/Designer placeholders if not specified.
3. **Report:**
   - One bullet per epic written, with path.
   - For each: `[GAP: ...]` count and the section(s) where they live.
   - In-flight epic conflicts noted in §10.
   - Suggested next step: "Approve drafts (move Status to `Ready` per `conventions/frontmatter.md`), then run `/stories <path-to-epic.md>` for each."

## Iteration rules

- Re-running `/epics` on the same PRD without an epic argument **always returns to explore mode** unless the existing drafts cover the strategy chosen. Ask the PM: "{N} epics already drafted in this initiative — propose new strategies or expand more epics?"
- Re-running on a specific `epic.md` is direct mode by another path — refresh that epic, respect Approved sections.

## What this runbook does not do

- It does not move Epic Status past Draft. The PM does.
- It does not write to the tracker. `/push` does.
- It does not write Story files. `/stories` does — and it loads the Epic via `parent: ../prd.md` in the Epic frontmatter (the runbook walks the chain from the Story side).
- It does not slice an epic into sub-flags speculatively. Sub-flags emerge in `/stories` only when a story genuinely needs independent rollout.
