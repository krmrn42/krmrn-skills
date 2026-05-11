---
name: prdspec
description: Implements the Requirements Management Framework — PM exploration → Pitch (PRD) → Epics → User Stories → tracker push, for AI-agent-driven delivery and PLG. Loaded by /prd, /epics, /stories, /push as the shared knowledge layer (templates, conventions, verb→tool binding). Triggers on "write a PRD", "draft a pitch", "shape epics for", "split this epic into stories", "decompose this epic", "push this epic to the tracker", "mirror to Jira/Linear/GitHub Projects". Carries three templates (PRD/Epic/Story verbatim from the framework), six conventions (frontmatter, gap-protocol, no-fabrication, parent-chain, flag-naming, workspace-layout), and tools.md — the only file that changes when an MCP backend replaces filesystem ops. /push is tracker-agnostic: the host's AGENTS.md declares which tracker and flag platform to drive. Disciplines: fresh-agent-run, [GAP: ...] over fabrication, anchor verification, inherited-pointers vs. anchors. Not for ad-hoc product brainstorming, tracker admin, or general project docs.
version: 0.1.0
---

# prdspec

A Claude Code skill that implements the **Requirements Management Framework**: a fresh-agent-run, flag-native pipeline from PM exploration to issue tracker.

This skill carries the **shared knowledge** that the four runbook commands depend on. The runbooks themselves live in `commands/` (`/prd`, `/epics`, `/stories`, `/push`).

## When to use

- **Always** when running one of the four slash commands. The command's prompt directs you to load this skill first.
- **On request** when the user asks about the framework's templates, conventions, or how a particular discipline applies in this codebase.
- **On detection** when the user asks to write a PRD/pitch, shape epics, decompose an epic into stories, or push requirements to a tracker — even without an explicit slash command. In that case, suggest running the appropriate slash command after loading this skill.

## What's bundled

### Templates (`templates/`)

Verbatim from `requirements-framework.md` §Template 1/2/3. Runbooks copy these into artifacts without translation.

- `templates/prd.md` — Pitch / PRD with §1–§13 (Problem, Evidence, Why-now, Bet & Appetite, Outcomes, Non-goals, Constraints, Solution shape, PLG mechanics, Rollout, Risks, Open questions, Anchors).
- `templates/epic.md` — Epic with §1–§10 (What ships, Inherits from PRD, Journeys, Solution shape, Done criteria, Flag plan, Dependencies, Out of scope, Telemetry, Anchors).
- `templates/story.md` — Story with §1–§10 (User statement, Inherits from Epic, Story-anchored evidence, Implementer context, Acceptance criteria, Edge cases, DoD, Flag wiring, Out of scope, Anchors).

### Conventions (`conventions/`)

Stable rule sheets. Each is a focused topic; the runbooks defer to these for edge cases.

- `conventions/frontmatter.md` — required fields per artifact type, Status field semantics (PM is sole mover), slug rules, Approved-section immutability, parent-link path form.
- `conventions/gap-protocol.md` — `[GAP: ...]` discipline, where gaps go, when to ask the 3–5 highest-leverage clarifying questions, when to use **N/A** instead.
- `conventions/no-fabrication.md` — never invent links/quotes/IDs; verify or surface as unverified; re-verify on each fresh agent run.
- `conventions/parent-chain.md` — inherited pointers vs. anchors, how to walk `parent:` fields up the chain, how the §2 sections of Epic and Story must be specific (not "see parent").
- `conventions/flag-naming.md` — `{prd_slug}.{epic_slug}[.{story_slug}]` (kebab-to-snake translation for flag platforms), lifecycle states, required-at-creation triad (runbook entry + kill-switch test + cleanup ticket), sub-flag exception.
- `conventions/workspace-layout.md` — `{NNN}-{slug}/` initiative directories at workspace root, archive boundary, no-renumber rule, positive-identification rule for artifact types, initiative-number allocation algorithm.

### Tools (`tools.md`)

The **verb → tool binding** for this environment. Runbooks reference verbs (`load template`, `save PRD draft`, `verify anchor`); `tools.md` says how each verb is performed today (filesystem + bash). When an MCP backend ships, `tools.md` is the **only** file that changes.

## How runbooks reference this skill

Each command in `commands/` opens with a "Pre-flight" step that reads the relevant subset of this skill. None of the runbooks duplicate the conventions or templates; they reference them by relative path within the plugin so a single source of truth holds.

## Universal disciplines (apply to every runbook)

1. **Fresh agent run.** No inherited chat state. Read the artifacts and the standing stores; that is your input. The runbook's job is to make the next artifact self-sufficient for the *next* fresh agent run.
2. **Gap protocol.** If a slot can't be filled with confidence, surface as `[GAP: ...]` and ask the 3–5 highest-leverage questions before drafting dependent slots.
3. **No fabrication.** If an anchor cannot be verified, surface as `[GAP: anchor unverified]`. Don't invent.
4. **Approved sections are immutable** for the current run.
5. **PM owns Status.** Subagents don't move the Status field.
6. **Status updates are PM-only and explicit.** A runbook does not transition Draft → In review or anything else.

## Out of scope for this skill

- General project documentation (architecture, ADRs, runbooks beyond requirements). Those live elsewhere — host project's `AGENTS.md` declares where.
- Tracker administration (creating projects, managing schemas). `/push` only mirrors items.
- Story-point estimation. Sizing is XS/S/M/L for sequencing only — not a commitment.
- Sign-off rituals. VCS history is the audit trail.
