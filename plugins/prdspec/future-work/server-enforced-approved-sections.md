---
title: Server-enforced approved-section immutability (MCP backend)
status: parked
created: 2026-05-09
last-touched: 2026-05-09
related-to: tools.md migration path, conventions/frontmatter.md, multi-agent safety, regulated-industry compliance
unlocks-when: prdspec ships an MCP backend; OR the convention-only enforcement causes its first real incident; OR a regulated user adopts the framework and needs auditable enforcement.
promoted-to:
---

# Server-enforced approved-section immutability

## Context

Today, "approved sections cannot be modified" is a **convention** documented in `conventions/frontmatter.md` and respected by the prdspec runbooks. Specifically:

- A PRD section can be marked `Approved` in frontmatter or annotated `<!-- approved -->`.
- When a runbook re-renders the artifact, it reads those markers and refuses to modify approved content.
- The PM can unlock by removing the marker; the runbook will then rewrite freely.

This works as long as **only the prdspec runbooks touch the artifact**, and only because they read `conventions/frontmatter.md`. As soon as another tool, agent, or human edits the file outside that flow, the convention provides no protection.

## Why convention-only is fragile

### 1. Multi-agent contamination

The framework's design point is "fresh agent run, no inherited chat state." That implies many agents will touch these files over the lifetime of an initiative. Some examples that don't go through prdspec:

- A separate `/architecture-review` agent annotating the PRD with cross-references.
- A copy-edit pass by a writing-focused agent.
- A `/security-review` agent appending threat-model commentary to §7 Constraints.
- A spreadsheet-like editor that bulk-updates Status fields.
- A renaming or refactoring tool that edits the file as part of a global change.

None of these agents have read `conventions/frontmatter.md`. Even if they do, they may interpret the rule loosely or simply lack the discipline to refuse.

### 2. Manual edits

A PM (or anyone with filesystem access) can edit an approved section by hand. There is no enforcement at the file-system level. This means:

- An accidental find-and-replace can mutate approved compliance language.
- A merge conflict resolution can silently weaken an approved constraint.
- A "tidy up the markdown" pass can reorder content, breaking implicit links.

### 3. No audit trail

When a mutation does happen, today there's no record of:

- Who tried to change what.
- When.
- Whether the attempt was rejected or succeeded.

VCS history shows the change after the fact, but only if someone notices and looks. There's no signal that "an approved section was modified in this commit" — that requires a custom git hook or a manual review.

### 4. No support for partial approval workflows

Today, approval is binary at the section level: a `<!-- approved -->` marker either applies or doesn't. There's no notion of:

- "This section is approved for technical decisions but evidence anchors can still be updated."
- "This constraint is approved by Compliance; updates require Compliance re-approval."
- "This non-goal is locked until the next quarter's planning cycle."

These would need a richer data model than markers in markdown can express.

## Proposal

When the prdspec MCP server ships, approved-section immutability moves from convention to **server-enforced policy**. Concretely:

1. **Artifacts are stored behind the MCP server.** Reads come from a server endpoint; writes go to a server endpoint. The filesystem is still where the bytes live, but the server mediates access.
2. **Section locks are first-class.** A section can be locked by:
   - **Approver identity** (PM, sponsor, compliance, security).
   - **Scope** (immutable, append-only, redacted-edits-only).
   - **Expiration** (locked until a date, until a condition, indefinitely).
3. **Write attempts are validated.** A POST to `prd_save(slug, content)` is parsed against the prior version; sections whose hashes have changed are checked against their lock. Rejected writes return a structured error naming the section and the policy.
4. **Audit log.** Every read, write attempt (accepted or rejected), and lock change is logged with timestamp, agent identity, and policy outcome. The log is queryable independently of VCS.
5. **Concurrent writes.** The server serializes writes to a given artifact. Two agents writing the same artifact don't trample; the second write rebases or fails per a configurable policy.
6. **Unlock workflow.** Removing a lock requires the original approver (or someone with delegated authority). The "unlock" is itself a logged event.

The runbooks in `commands/` would not change — they continue to call `save PRD draft`. The verb's binding shifts from a local file write to an MCP call (this is exactly the migration shape designed into `tools.md`). Today's `[BLOCKED: section locked]` surfaced by the runbook becomes the same surface, but the rejection comes from the server, not from the runbook reading frontmatter.

## Use cases (the "why this matters" expanded)

### Compliance lock-in

A PRD §7 Constraints section reads "SOC 2 CC6.1: role checks at the API gateway; audit log entries for every access decision." Once approved by Compliance, this language is locked. A future Epic-shaping agent that thinks "we can simplify by using a basic auth check" cannot quietly weaken it. A subsequent compliance audit can confirm: this constraint was authored on date X, approved by Y, never modified since.

### Bet preservation

PRD §4 Bet & Appetite reads "If we ship semantic search, we expect trial-to-first-agent < 5 min within Q3 2026." This is the bet — the thing engineering signed up to test. Once approved, an Epic-shaping agent cannot rewrite "5 min" to "10 min" because the implementation is harder than expected. The bet either succeeds, fails, or is killed at the appetite-window checkpoint with the original numbers.

### Non-goal protection

PRD §6 Non-goals reads "We will not build a federated identity provider as part of this initiative." During Epic shaping, it becomes tempting to slip a small federated-IdP component in to unblock a particular customer. Server enforcement makes this visible: the non-goal cannot be silently modified to "we will build a minimal federated IdP." Adding the IdP requires explicit re-opening of §6 with the original approver.

### Outcome thresholds

PRD §5 Outcomes specifies "Activation rate ≥ 40% in beta cohort." Engineering encounters a hard problem and considers writing the Epic with a softer target. The lock prevents that — the Epic must achieve 40% or the bet's kill criterion fires.

### Multi-stakeholder coordination

A PRD has approvals from PM, sponsor, compliance, and tech-lead, each on different sections. Today, all approvals are equally inviolate by convention. With server enforcement:

- Tech-lead can update the §7 Technical constraints (their domain) without unlocking compliance's §7 Compliance constraints.
- Compliance's lock on a specific control survives a Tech-lead refactor.
- PM coordinates as the integrator but doesn't have to manually re-verify everyone's locks after every agent run.

### Audit and post-incident review

Six months after launch, a customer incident traces back to a missing audit-log entry. Question: was that requirement ever in the PRD? With server-enforced locks and an audit log, the answer is unambiguous: the constraint was written on X, approved by compliance, never modified, and the corresponding Epic §5 Done criterion was satisfied per the test in `tests/audit_log_test.py`. Without enforcement, the answer requires manual VCS forensics and is rarely conclusive.

## Trade-offs / open questions

- **Adoption friction.** Server enforcement requires running the MCP server. For small teams, this may be more weight than the PM-discipline-only approach. We need a graceful "convention-only mode" that doesn't require the server.
- **Approval delegation.** Compliance teams routinely delegate ("any senior compliance engineer can approve CC6.1 updates"). The lock model needs to support delegation without becoming a permission system in miniature.
- **Diff semantics.** What counts as "modifying" an approved section? Whitespace changes? Reordering? Renaming an anchor link target? The server needs a content-comparison policy that distinguishes meaningful from cosmetic changes.
- **Lock expiration.** Should locks have default expiration dates (e.g., 12 months) to force re-review? Or is "indefinite until unlocked" the right default?
- **Cross-artifact locks.** A constraint approved at the PRD level should propagate to inheriting Epics. Today the §2 inherited-pointers section makes this textual; in a server-enforced world, should the Epic's inherited constraints also be locked?
- **Migration of existing artifacts.** When a host project switches from convention-mode to server-enforced mode, what happens to artifacts already on disk with `<!-- approved -->` markers? The first server scan needs an unambiguous import policy.

## Why we're parking it

- Server-enforced makes sense only after the MCP backend ships, and the MCP backend is justified only after pilot usage stresses the convention-only approach.
- The framework's "skill-first" design (per `prd-tool-handoff.md`) is intentional: walk before run. Move to MCP when there's a real incident or a real regulated user.
- Building this prematurely would couple the framework to a specific permissions model before we understand how teams actually use approval in practice.
