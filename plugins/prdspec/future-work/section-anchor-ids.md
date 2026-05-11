---
title: Stable per-section anchor IDs in artifacts
status: parked
created: 2026-05-09
last-touched: 2026-05-09
related-to: templates/*, conventions/parent-chain.md, conventions/frontmatter.md
unlocks-when: a PM reorders/renames sections and downstream artifacts' inherited-pointer references break; OR the framework adds a "diff explanation" feature that needs stable identifiers for changed sections.
promoted-to:
---

# Stable per-section anchor IDs in artifacts

## Context

Today, inherited pointers reference sections by their **§-numbered position** in the framework template:

- Epic §2: "Outcome served (PRD §5): Outcome #2."
- Story §2: "Constraints inherited (PRD §7): p95 < 200ms."

These references are resilient as long as:

1. The framework's template numbering doesn't change.
2. The host PM doesn't reorder sections inside their PRD.
3. The host PM doesn't add/remove sections, shifting later numbers.

Empirically, (1) is fine — the templates are versioned with the framework. (2) and (3) are PM behaviors we cannot strictly control. A PM who wants to put §6 Non-goals before §5 Outcomes will do so; a PM who adds an "Internal stakeholders" section after §1 Problem effectively renumbers everything below it.

When that happens, every downstream artifact's "PRD §5" reference silently points at the wrong section.

## Proposal

Each section in templates gets a **stable anchor ID** independent of its position. Two implementation options:

### Option A: explicit anchor frontmatter

Each section is preceded by an HTML comment with an ID:

```markdown
<!-- section: outcomes -->
## 5. Outcomes
```

Inherited pointers reference the ID, optionally including the position for human readability:

- "Outcome served (PRD section `outcomes` / §5): Outcome #2."

The runbooks are taught to:
1. Resolve inherited pointers by ID first, falling back to position if the ID is missing (legacy artifacts).
2. Write inherited pointers using both forms: `outcomes` (stable) and §5 (current).

### Option B: heading-derived anchor

Use the slugified heading text as the implicit ID:

- "## 5. Outcomes" → ID `outcomes`.
- Pointers reference `outcomes`; the runbook resolves by searching for the heading.

This is what GitHub's Markdown renderer does. No frontmatter needed, but heading rewrites still break references.

### Option C (most ambitious): structured artifact

Move artifacts to a richer format (YAML / JSON wrapped in frontmatter; or a literate format like RMarkdown) where sections are first-class with stable IDs. The Markdown rendering becomes a derivation, not the source.

This is a much bigger lift and probably wrong for a pilot. Mentioned for completeness.

## Use cases

- **A PM reorders sections** (say, moves §6 Non-goals before §5 Outcomes for emphasis). With anchor IDs, downstream artifacts' references continue to resolve.
- **A PM adds a new section** (say, an `Internal context` section after §1). Numbering shifts; IDs don't.
- **A diff-explainer feature** (see future-work entry: `in-runbook-diff-surfacing`) wants to say "you changed §5 Outcomes." With IDs, this is robust to reordering; without, the diff misattributes changes.
- **External tooling** (a future dashboard, a JIRA-side overview) wants to deep-link into a specific PRD section. IDs make this stable.

## Trade-offs / open questions

- **Authoring overhead.** Option A adds an HTML comment before every section. Templates carry it; PM-added sections need to follow the convention. Easy to forget.
- **Backwards compatibility.** Existing artifacts have no IDs. The migration: a runbook pass that injects IDs based on current heading text (idempotent if the IDs already match).
- **Section renames.** If a PM renames "Outcomes" to "Goals," the heading-derived ID (Option B) breaks. Option A survives because the comment ID is independent of heading text.
- **Markdown ergonomics.** HTML comments in section headers are slightly ugly. Worth the visual noise? Probably yes for the cross-artifact linking value.
- **Whether IDs are needed at all.** Maybe the right answer is "PMs should not reorder framework sections; if they need to, that's a fork of the framework, not a customization." Worth a real conversation rather than just adding the feature.

## Why we're parking it

- We don't yet know if PMs will actually reorder sections. The framework's templates are deliberately specific; the friction for reordering is high enough that maybe it doesn't happen.
- Adding IDs prematurely costs authoring overhead and visual noise without clear payoff.
- Worth pilot data on "did anyone reorder?" before solving.
