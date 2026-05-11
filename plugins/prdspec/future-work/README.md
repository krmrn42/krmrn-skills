# Future-work registry

A flat directory of parked ideas — improvements, second-system features, architectural moves we want to capture before they evaporate but don't want to commit to building. The framework explicitly does **not** have a "backlog" at the PRD level (the framework's principle is `bet > backlog, with a documented bet`); this registry serves a different purpose: it captures **possible future bets** before they're worth pitching.

## Why a registry, not just GitHub issues

A GitHub issue is the wrong shape for "we noticed something while building X; might be worth thinking about in 6 months":

- Issues encourage immediate triage, prioritization, and assignment. None of that applies here.
- Issues are tracker-specific. This registry travels with the repo.
- Issues are read by engineers; this registry is read by the PM (and the framework's own `/prd` runbook in the future) as a source of *strategic* candidates.

When an entry graduates to a real bet, it becomes a `/prd` invocation. Until then, it lives here.

## Structure

One Markdown file per idea, kebab-case slug. Frontmatter:

```markdown
---
title: <one-line title>
status: parked | exploring | promoted | dropped
created: YYYY-MM-DD
last-touched: YYYY-MM-DD
related-to: <free-form — runbook, convention, or framework area this touches>
unlocks-when: <what would change to make this worth pitching>
promoted-to: <path to PRD if promoted; otherwise empty>
---
```

Body sections (loose; adapt per entry):

- **Context** — what's the current behavior; what limitation prompted this entry.
- **Proposal** — what would change.
- **Use cases** — who benefits and how.
- **Trade-offs / open questions** — what's not obvious; what would need to be decided.
- **Why we're parking it** — why this isn't being built now.

## Status semantics

| Status | Meaning |
|---|---|
| `parked` | Captured but no active investigation. Default for a new entry. |
| `exploring` | Someone is poking at it informally — sketching, prototyping, having conversations. Still pre-PRD. |
| `promoted` | Graduated to a real bet. The entry links to the PRD path; the PRD's `Anchors → Prior art` section reciprocally links here. |
| `dropped` | Considered and rejected. The entry retains the reasoning so we don't re-litigate. |

## Lifecycle

1. **Capture.** Add a markdown file with `status: parked`.
2. **Sit.** Most entries should sit. Resist the urge to "groom" them.
3. **Re-read on demand.** Before authoring a new PRD on a related topic, scan the registry for relevant parked entries — the historical context may save you a clarifying round.
4. **Promote** when the `unlocks-when` condition is met. Move status to `promoted`, set `promoted-to`, run `/prd <slug>`.
5. **Drop** ideas explicitly when they're no longer relevant. Don't silently delete — the historical "why" matters.

## Index (current entries)

- [`server-enforced-approved-sections.md`](./server-enforced-approved-sections.md) — Move approved-section immutability from convention to MCP-enforced. Compliance / multi-agent-safety driver.
- [`enhanced-anchor-verification.md`](./enhanced-anchor-verification.md) — Verify anchor *content*, not just HTTP status. Reduce silent rot.
- [`slug-auto-derivation.md`](./slug-auto-derivation.md) — Auto-suggest slugs from titles vs. requiring explicit slug args.
- [`section-anchor-ids.md`](./section-anchor-ids.md) — Stable anchor IDs per section to survive reordering and rename.
- [`in-runbook-diff-surfacing.md`](./in-runbook-diff-surfacing.md) — Show the PM what changed at the end of each runbook run, not just "saved".
- [`future-work-workflow.md`](./future-work-workflow.md) — A `/future-work` workflow for managing this registry itself (meta).

## What this registry is NOT

- Not a backlog. Backlog implies commitment. This is "ideas we want to remember."
- Not a place to store TODOs in active code. Use code comments / issues for those.
- Not a substitute for `/prd`. Once an entry graduates, it goes through the regular PRD pipeline like any other bet.
