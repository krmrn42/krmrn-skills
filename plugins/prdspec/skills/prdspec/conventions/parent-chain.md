# Convention: parent chain

Two distinct kinds of pointers appear in artifacts and **must not be confused**:

- **Inherited pointers** travel **up** the chain to parent artifacts that bind the current one. A child uses inherited pointers to declare *"what already-decided context applies to me."*
- **Anchors** travel **out** to standing knowledge stores. A child uses anchors to declare *"what external knowledge applies to me."*

## Walking the chain

Subagents resolve parent pointers via the `parent: ...` frontmatter field. The chain:

```
exploration.md   (no parent)
       ↑ Strategic parent (link to OKR)
prd.md           (parent: ./exploration.md)
       ↑ inherited pointers (Epic §2)
epic.md          (parent: ../prd.md)
       ↑ inherited pointers (Story §2)
story.md         (parent: ../epic.md, also: ../../prd.md for fresh-load convenience)
```

When a runbook starts, it walks **up** the chain loading parents transitively:

- `/epics` loads its target (PRD) and the linked exploration snapshot.
- `/stories` loads its target (Epic), follows `parent: ../prd.md` to load the PRD, then optionally the exploration if needed for evidence anchoring.
- `/push` loads the Epic and all its Stories, plus the PRD for context (does not need exploration).

If a `parent` link is broken (path doesn't resolve), the runbook **stops** and surfaces the issue to the PM. It does not fabricate the missing parent.

## Inherited pointers (the §2 sections)

The `Inherits from PRD` (Epic §2) and `Inherits from Epic` (Story §2) sections are **not optional** and **not generic**. They name the **specific items** from the parent that bind this child.

Bad (generic):

```markdown
## 2. Inherits from PRD
- See parent for context.
```

Good (specific):

```markdown
## 2. Inherits from PRD
- **Outcome served (PRD §5):** Outcome #2 — "trial-to-first-agent < 5 min."
  This epic delivers the data-ingestion half; the search-UI half ships in
  the `search-ui-mvp` epic.
- **Constraints that bind (PRD §7):** "p95 < 200ms on the search endpoint";
  "SOC 2 CC6.1 enforced at the API gateway".
- **Non-goals reaffirmed (PRD §6):** "no per-tenant index isolation in v1" —
  particularly tempting to violate when shaping the multi-tenant connector.
- **Bet & kill criteria (PRD §4):** Hypothesis fragment: "agents finish a
  search in < 2s." Kill criterion that applies here: "if cold-start
  latency exceeds 500ms after two implementer attempts, reassess."
```

A **fresh** `/stories` agent loading just the Epic + PRD must be able to scope correctly without re-reading the entire PRD. The §2 section is the contract that makes that possible.

## Anchors (the §10 / §13 sections)

Anchors point **outward** to standing stores. They are the framework's "fresh-agent test": the next runbook reading this artifact should be able to use each anchor without further explanation.

Two non-negotiables for every anchor:

1. A direct link or a path the runbook can resolve.
2. A *why-it-matters* annotation in 1–2 lines.

A URL without rationale fails the freshness test — a fresh agent reading the artifact cannot tell whether to follow the link or what to do with what it finds.

## What goes where

| Question | Where it lives |
|---|---|
| "Which parent decisions bind me?" | Inherited pointers (§2 of Epic/Story) |
| "Which external knowledge bears on me?" | Anchors (§10 / §13) |
| "Which sibling did this thing already?" | In-flight context anchors (Epic §10) or `Depends on` frontmatter (Story) |
| "What does my parent say about its own parent?" | Don't transcribe — link to parent's §2 if you need to refer |
