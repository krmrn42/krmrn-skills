# Epic: {Saleable increment name}

> **Status:** Draft | Ready | In progress | In rollout | GA | Done
> **Parent PRD:** ../prd.md
> **DRI:** @owner · **Tech lead:** @owner · **Designer:** @owner
> **Tracker ID:** [link to Linear/Jira epic]
> **Slug:** kebab-case
> **Target rollout window:** YYYY-MM — YYYY-MM

---

## 1. What ships
> *Press-release test: write a one-line release note for the moment this epic exits its flag. If you can't, the increment isn't saleable yet.*

**Release note:** "{One sentence describing user-visible value.}"

[1–2 paragraphs of context for someone who won't read the PRD]

## 2. Inherits from PRD
> *Explicit pointers to which PRD sections bind this epic. Not a blanket "see parent" — name the specific items so a fresh /stories agent loading just this Epic + the PRD can scope correctly.*

- **Outcome served (PRD §5):** Outcome #{N} — "{outcome name}". This epic delivers {fraction or specific contribution — e.g., "the data ingestion half; search UI ships in Epic-2"}.
- **Constraints that bind (PRD §7):** {list specific constraint lines, e.g., "p95 latency < 200ms; SOC 2 CC6.1; supports on-prem deployment"}
- **Non-goals reaffirmed (PRD §6):** {non-goals from PRD that are particularly tempting to violate inside this epic}
- **Bet & kill criteria (PRD §4):** {restate the hypothesis fragment this epic tests; restate the kill criteria that apply at this epic's checkpoint}

## 3. User journeys included
> *Each becomes one or more User Stories. List the journey, not the implementation.*

- **J1:** {persona} {goal} → {outcome}. Story candidates: {short list}
- **J2:** ...

## 4. Solution shape (this epic)
> *The slice of PRD §8 Solution shape that applies here. If this epic introduces shape decisions not in the PRD, name them explicitly so they can be reviewed. Pin design files (Figma, prototypes, flows) here — this is the design hand-off point into Story decomposition.*

[shape]

**Design artifacts:**
- [Figma: {epic name} flows](url) — *Primary UX source for stories under this epic; tokens follow design system.*
- ...

## 5. Done criteria
> *Observable conditions for this epic to GA-default. Functional, non-functional, telemetry, ops.*

- **Functional:** [what must work]
- **Performance:** [latency / throughput / error budgets]
- **Security & compliance:** [audit log entries, data classification, access controls]
- **Telemetry:** [events emitted, dashboards live, alerts configured]
- **Documentation:** [user-facing, agent-readable API, internal runbook]

## 6. Feature flag plan
> *Every epic has its own flag. Stories inherit it. Sub-flags only when a story needs independent rollout.*

**Flag name:** `{prd_slug}.{epic_slug}` — e.g., `shift.semantic_search.jira_connector`
**Default:** off
**Owner of flag lifecycle:** @owner
**Cleanup ticket:** [link — must exist before merge to main]
**Per-phase entry criteria:** inherits PRD §10; override here only if this epic ships on a different cadence
**Kill switch behavior:** when flag flips off, {describe user-visible behavior — graceful degradation, fallback, error}; verified by test {test name/path}.

## 7. Dependencies
> *What must exist before this epic can ship.*

- **Blocking us:** [other epics, infra work, third-party API, design system component]
- **Blocked by us:** [what we'll deliver to others]
- **External:** [vendors, legal review, security review]

## 8. Out of scope
> *Items explicitly deferred. Cite the epic or PRD section that owns the deferred work.*

- {item} — deferred to [Epic Y] / [Backlog] / [out of scope of this PRD]

## 9. Telemetry & success metrics
> *Defined here so they're built in, not added after launch.*

**Events:** [event_name, payload shape, where fired]
**Dashboards:** [link or "to be built; ticket {ID}"]
**Success thresholds:** [activation %, error rate, p95 latency, support ticket volume]
**Review cadence:** [weekly during beta, monthly after GA]

## 10. Anchors

### Architecture
- [ADR-0042: agent-runtime sandbox boundaries](url) — *§4 Solution shape sits on top of this; "no synchronous host calls" is a hard constraint passed to all stories under this epic.*
- [System diagram: ingestion pipeline](url) — *Names the components stories will touch.*
- ...

### Code-surface map
> *Services this epic touches at high level. Deep code refs go in each story.*

- `services/ingestion-api` — entry points for new connectors
- `services/index-worker` — embedding + write path
- `web/portal/app/search` — UI surfaces

### In-flight context
- [Epic: marketplace billing v2](url) — *Active; shares the auth gateway. Coordinate with @owner before §6 flag promotion to avoid auth-flag conflict.*
- ...

### Flag namespace
- This epic owns `{prd_slug}.{epic_slug}.*`. Sub-flags must be registered in DS-FLAGS before merge.

### Other references
- [link] — *why*
