---
title: Surface a structured diff at the end of every runbook run
status: parked
created: 2026-05-09
last-touched: 2026-05-09
related-to: commands/prd.md, commands/epics.md, commands/stories.md, commands/push.md
unlocks-when: pilot reveals that PMs are using `git diff` after every run as a verification step; OR runbook re-runs cause confusion about what changed; OR the framework adds CI integration where automated diff-summarization is needed.
promoted-to:
---

# Surface a structured diff at the end of every runbook run

## Context

Today, when a runbook re-renders an artifact, the report it produces is essentially "saved" + a list of GAPs. The PM's verification path is:

1. Read the runbook's report.
2. Run `git diff` to see what actually changed.
3. Mentally reconcile (1) and (2).

This works but has costs:

- The PM doesn't know whether the runbook actually changed something or "rewrote-but-same."
- The PM can't tell whether their manual edits between runs were preserved.
- The PM has no signal that "an Approved section was respected" — only that no changes were rejected.

## Proposal

Each runbook run ends with a structured diff report. Format:

```text
Changes to {artifact-path}:
  Sections added:
    - §11 Risks & rabbit holes (new — was empty in prior run)
  Sections modified:
    - §13 Anchors → Evidence (added 2 anchors, none removed)
    - §3 Why now (rewritten per PM clarification round 2)
  Sections preserved verbatim (Approved or unchanged):
    - §4 Bet & Appetite (Approved)
    - §6 Non-goals (Approved)
    - §1 Problem (unchanged)
  Sections rejected (would have changed but Approved):
    - none
  PM edits preserved (between runs):
    - §7 Constraints, paragraph 2 — your manual addition retained.
```

Plus the existing GAP list and next-step suggestion.

## Use cases

- **Refinement loops.** A PM iterating on a PRD over several `/prd` runs needs to track progress without comparing to the previous version manually.
- **Cross-team handoffs.** Tech-lead picks up the PRD after a refinement round. The diff report surfaces what's new since they last reviewed.
- **CI-enforced policies.** A future hook could enforce "an Approved-section change in a commit must include an unlock-and-re-approve trail." That requires structured diff output the hook can parse.
- **Compliance review.** Quarterly review wants to see "what changed in this PRD this quarter." Concatenating the per-run diffs is faster than scanning git history.

## Trade-offs / open questions

- **Implementation cost.** Producing this diff requires the runbook to compare the old and new artifact ASTs — not just text. Markdown parsing is required to identify section boundaries.
- **Verbosity.** A long diff report at the end of every run might bury the action items (GAPs, next steps) under noise. Need to keep it scannable.
- **Failure modes.** What if section boundaries shift (e.g., heading edited)? The diff might claim "section removed, new section added" when really it's a rename. Section anchor IDs (see related future-work entry) would help.
- **Scope.** Story decomposition produces N files at once. The diff report grows linearly. Worth condensing into an aggregate summary plus per-file detail on demand.

## Why we're parking it

- v1 PMs have `git diff`. The framework's audit trail is VCS history.
- This is a UX improvement, not a discipline. Wait for pilot signal that it's actually missed.
- Section-anchor-ids future-work entry is a prerequisite for robust diff attribution. Build that first, if at all.
