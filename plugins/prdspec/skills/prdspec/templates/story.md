# Story: {User-perspective outcome}

> **Status:** Draft | Ready | In progress | In review | Done
> **Parent epic:** ../epic.md
> **Parent PRD:** ../../prd.md *(transitive — repeated for fresh-load convenience)*
> **DRI:** @owner · **Implementer:** @human-or-agent
> **Tracker ID:** [link]
> **Slug:** kebab-case
> **Depends on:** {sibling-story-slug, ...} *(optional; sibling slugs only — captures hard requirements-side dependencies, not implementation sequencing)*
> **Estimated size:** XS | S | M | L *(sequencing only, not commitment)*

---

## 1. User statement
> *Standard form. The "so that" clause is the appeal to the parent epic.*

As a **{persona}**, I want **{capability}** so that **{outcome that maps to a journey in the parent epic}**.

## 2. Inherits from Epic
> *Explicit pointers to the Epic items this story serves and binds to. A fresh implementer loading just this Story should know which parent context applies without rereading the whole Epic.*

- **Journey served (Epic §3):** J{N} — "{journey title}"
- **Done-criteria contribution (Epic §5):** {which functional / performance / security / telemetry items this story moves toward}
- **Flag inherited (Epic §6):** `{epic flag}` — see §8 below for wiring
- **Constraints inherited (PRD §7):** {specific lines that apply to this story — e.g., "p95 < 200ms applies to the new search endpoint"}

## 3. Story-anchored evidence
> *Required when the parent Epic's journey ties to specific evidence in PRD §13; mark **N/A** otherwise. The specific customer voice this story serves. Closes the loop from PRD evidence to a concrete user need at implementation time, useful for the implementer's judgment on edge cases.*

- [Customer quote / clip: Acme Corp, 2026-04-12 @ 14:30](url) — *"We gave up on the second sandbox" — the specific friction this story removes.*

## 4. Implementer context
> *Story-specific pointers that narrow the implementer to the right corner of the codebase. Filled by the /stories subagent via code search; updated before handoff if anything has shifted. Complements project-wide knowledge available through skills, AGENTS.md, indexed internal docs, and MCP servers.*

**Repos / paths:**
- `{repo}/{path/to/relevant/module}` — {what lives here}
- `{repo}/{path/to/tests}` — {fixture and test patterns to follow}

**Patterns to follow:**
- {convention 1, with file ref} — e.g., "All new endpoints use the `withAuth(handler)` wrapper; see `api/agents/[id]/route.ts:14`."
- ...

**Data models touched:**
- `{Model}` — {fields read/written}

**Existing tests to extend:**
- `{path/to/test.ts}` — {how}

**Things the implementer should NOT do:**
- {anti-pattern, with reason}

## 5. Acceptance criteria
> *Given/When/Then. Each individually verifiable. If a criterion can't become a test, rewrite it.*

- **AC1:** Given {state}, when {action}, then {observable result}.
- ...

## 6. Edge cases & error states

| Case | Expected behavior |
|---|---|
| {network failure mid-action} | {graceful retry / error toast} |
| {empty input} | ... |
| {permission denied} | ... |

## 7. Definition of Done
> *Universal checklist. Append project-specific items.*

- [ ] All acceptance criteria pass automated tests
- [ ] Feature flag check is in place at the entry point(s); off-state behavior matches §8 spec, verified by test
- [ ] Telemetry events emitted as specified in Epic §9
- [ ] Error paths produce structured logs with correlation IDs
- [ ] Accessibility: keyboard nav, ARIA labels, contrast meets WCAG AA
- [ ] Performance: meets Epic §5 budget under load test
- [ ] Docs updated: user-facing copy, agent-readable API spec
- [ ] PR description references this story and parent epic
- [ ] No new flag without a paired cleanup ticket

## 8. Feature flag wiring
> *Where the flag check goes. Specific. An AI agent should insert it without guessing.*

**Inherits flag:** `{epic flag}` — from Epic §6
**Sub-flag (if any):** `{epic flag}.{story slug}` — *only if this story needs to ship independently within the epic*

**Check locations:**
- `{file:line}` — entry point of the new code path
- `{file:line}` — UI rendering guard

**Off-state behavior:** {what users see / what the API returns when the flag is off — not just "hidden"; specify}

## 9. Out of scope
> *Items deferred to other stories within this epic, or to a future epic.*

- {item} — handled by Story {ID} / deferred

## 10. Anchors

### Project knowledge
> *Curated subset of standing knowledge that bears specifically on this story. Pinned during /stories decomposition so the implementer doesn't re-discover it. The implementer still has access to project-wide knowledge via skills, AGENTS.md, etc. — these are the entries we already know apply.*

- [ADR-0042: agent-runtime sandbox boundaries](url) — *This story crosses the sandbox at §5 AC2; the "no synchronous host calls" rule constrains the implementation.*
- [Runbook: Qdrant index rebuild](url) — *Touched if the schema change in AC3 lands; rebuild must run before flag promotion.*
- [Design tokens: status indicators](url) — *Use `status.warning` token, not a hardcoded color, for the deferred-state badge in AC4.*

### Vendor docs
- [Jira REST API: search endpoints](url) — *AC1 calls `POST /rest/api/3/search/jql`; rate-limit headers must be honored per §6.*

### Compliance controls (specific)
- [SOC 2 CC6.1 — Logical access controls](url) — *Inherited from PRD §7; this story's new endpoint must enforce role checks at the gateway.*

### Other references
- [link] — *why*
