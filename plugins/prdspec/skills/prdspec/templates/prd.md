# Pitch: {Concise capability name}

> **Status:** Draft | In review | Approved | Active | Shipped | Archived
> **DRI:** @owner
> **Created:** YYYY-MM-DD · **Last updated:** YYYY-MM-DD
> **Slug:** kebab-case-slug-used-for-flags
> **Initiative dir:** {NNN}-{slug}/
> **Exploration:** ./exploration.md *(sibling)*
> **Strategic parent:** [link to OKR or roadmap theme]

---

## 1. Problem
> *What is broken or missing, for whom, right now? One paragraph. Specific user, specific pain. No solutions yet.*

[paragraph]

## 2. Evidence
> *Qualitative signal that this problem is real. Each bullet ties to an anchor in §13.*

- [observation] — *anchor: §13 Evidence #1*
- ...

## 3. Why now
> *What changed that makes this the right moment? Market shift, technology unlock, customer pull, internal capability, regulatory pressure. If "why now" is weak, the bet is weak.*

[paragraph]

## 4. Bet & Appetite
> *The hypothesis we're testing and the budget we're willing to spend before re-evaluating.*

**Hypothesis:** If we ship {X}, we expect {measurable outcome Y} within {timeframe} because {causal mechanism Z}.

**Appetite:** {Small ~2 weeks · Medium ~6 weeks · Large ~quarter}

**Kill criteria:** At the **end of the appetite window** (or earlier if any criterion is observed), we stop and reassess if any of the following is true:
- [criterion 1, observable]
- [criterion 2, observable]

## 5. Outcomes
> *1–3 outcomes. Each measurable. Pair leading and lagging indicators. Cite analytics anchors where the indicator is defined.*

| # | Outcome | Leading indicator (anchor) | Lagging indicator (anchor) |
|---|---|---|---|
| 1 | ... | ... — *§13 Analytics #1* | ... — *§13 Analytics #2* |

## 6. Non-goals
> *What we will NOT do, even though tempting. Specific — name features, integrations, edge cases. The most under-written PRD section and the one that prevents most scope creep.*

- We will not {specific thing}.
- ...

## 7. Constraints
> *Hard boundaries that shape the solution space. Inputs to design, not aspirations. Compliance constraints cite specific anchors in §13.*

**Technical:** [stack, integration points, latency budgets, data residency]
**Compliance & security:** [specific controls — e.g., "SOC 2 CC6.1 — see §13 Compliance #1"]
**AI governance** *(if any AI/ML component):* autonomy level (suggest / confirm / autonomous), explainability tier, human-in-the-loop checkpoints, data sensitivity. Mark **N/A** if no AI component.
**Performance / scale:** [throughput, p95/p99, concurrency]
**Budget / time:** [appetite per §4; add headcount or vendor budget]
**Brand / UX:** [voice, accessibility floor, supported locales]

## 8. Solution shape
> *The "fat marker sketch" — rough but committal. Names the surfaces involved, the data flow, the user-visible affordances. Does NOT specify pixels, copy, or function signatures. 2–4 paragraphs or an annotated diagram. Must be specific enough that an Epic-shaping agent can identify candidate slicing axes.*

[shape]

## 9. PLG mechanics
> *How users discover, activate, and expand value. If sales-led only, mark sections N/A explicitly — don't omit them.*

**Discovery:** How does a prospective user find this capability? (SEO surface, in-product nudge, viral artifact, agent-readable docs)

**Activation — the aha moment:** What single observable event means "this user got it"? Target time-to-aha: {seconds/minutes}. The 2026 PLG benchmark for first-session aha is under 60 seconds for AI-native products.

**Expansion loop:** What user action makes the next user (seat, workspace) more likely?

**Friction inventory:** Blockers to self-serve activation; for each: remove, defer, or accept.

**Agent-readability:** Can an external AI agent operate this capability via API and structured docs? If no, what's the gap?

## 10. Rollout strategy
> *Every PRD ships behind a top-level flag.*

**Top-level flag:** `{product}.{slug}` — e.g., `shift.semantic_search`

**Phases:**
| Phase | Audience | Entry criteria | Exit criteria |
|---|---|---|---|
| Dark launch | Internal staff | Code merged, telemetry wired | No P0/P1 over 3 days |
| Beta cohort | Named design partners | Onboarding doc, support trained | Activation ≥ X%, NPS ≥ Y |
| GA opt-in | All users, toggle | Beta exit met | Adoption ≥ Z% |
| GA default | All users, on by default | GA opt-in adoption sustained 2 weeks | — |
| Cleanup | — | GA-default 4 weeks, no rollbacks | Flag removed from code |

**Kill switch:** Top-level flag flips off without a deploy. Runbook: [link]. Customer comms template: [link].

## 11. Risks & rabbit holes
> *What could derail this. For each: describe + decide (mitigate / accept / monitor).*

- **Risk:** ... · **Decision:** mitigate by ...
- ...

## 12. Open questions
> *Things we don't know yet, blocking Epic shaping. Tag with @owner.*

- [ ] [question] — @owner

## 13. Anchors
> *Structured links to standing knowledge stores. Every anchor includes WHY it matters in 1–2 lines. The fresh-agent test: a `/epics` agent loading this PRD should be able to use each anchor without further explanation.*

### Exploration
- [./exploration.md](./exploration.md) — *Sibling snapshot of the PM exploration that seeded this PRD; covers customer interviews W14–W17 and competitive teardown.*

### Strategic
- [OKR Q3 2026: "Reduce time-to-first-agent below 5 minutes"](url) — *§5 Outcome 1 directly contributes to this OKR; this PRD is the primary path-to-target.*

### Evidence
- [Customer call: Acme Corp, 2026-04-12](url) — *Source for the activation friction in §1; quote at 14:30 anchors the "we gave up on the second sandbox" claim.*
- [Support ticket cluster #2412–#2467](url) — *57 tickets across 6 weeks all stem from the failure mode in §1.*
- ...

### Analytics
- [Mixpanel cohort: trial signups by aha completion](url) — *Defines the activation event used in §5 indicators; cohort with aha < 60s retains 3.2× better.*
- ...

### Compliance
- [SOC 2 CC6.1 — Logical access controls](url) — *Binds §7; any new agent surface must enforce role checks at the API gateway.*
- ...

### Prior art
- [PRD: agent-runtime sandboxing v1, 2025-Q4](url) — *Predecessor; we extend its sandbox boundary. §8 Solution shape assumes its primitives.*
- ...

### Other references
- [link] — *why*
