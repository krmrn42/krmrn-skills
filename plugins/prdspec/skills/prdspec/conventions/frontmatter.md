# Convention: frontmatter

Every artifact (PRD, Epic, Story, Exploration snapshot) carries a YAML-style block of metadata at the top. The framework writes only specific fields; the host project may add others. Subagents read frontmatter to walk the parent chain and to decide which sections are immutable.

## Required fields per artifact type

### Exploration snapshot (`{NNN}-{slug}/exploration.md`)

```markdown
> **Type:** exploration
> **Source:** chat | notion | file
> **Captured:** YYYY-MM-DD
> **Slug:** kebab-case
```

Exploration has no `Status`. It's an immutable historical capture; subsequent runs append a new dated section, never overwrite.

### PRD (`{NNN}-{slug}/prd.md`)

```markdown
> **Status:** Draft | In review | Approved | Active | Shipped | Archived
> **DRI:** @owner
> **Created:** YYYY-MM-DD · **Last updated:** YYYY-MM-DD
> **Slug:** kebab-case-slug-used-for-flags
> **Initiative dir:** {NNN}-{slug}/
> **Exploration:** ./exploration.md
> **Strategic parent:** [link to OKR or roadmap theme]
```

### Epic (`{NNN}-{slug}/{epic-slug}/epic.md`)

```markdown
> **Status:** Draft | Ready | In progress | In rollout | GA | Done
> **Parent PRD:** ../prd.md
> **DRI:** @owner · **Tech lead:** @owner · **Designer:** @owner
> **Tracker ID:** [link to Linear/Jira epic]
> **Slug:** kebab-case
> **Target rollout window:** YYYY-MM — YYYY-MM
```

### Story (`{NNN}-{slug}/{epic-slug}/stories/{story-slug}.md`)

```markdown
> **Status:** Draft | Ready | In progress | In review | Done
> **Parent epic:** ../epic.md
> **Parent PRD:** ../../prd.md
> **DRI:** @owner · **Implementer:** @human-or-agent
> **Tracker ID:** [link]
> **Slug:** kebab-case
> **Depends on:** {sibling-story-slug, ...}
> **Estimated size:** XS | S | M | L
```

## Status field semantics

The PM is the **sole mover** of `Status`. Subagents do not change `Status` automatically. Reviews from sponsors, tech leads, designers happen as edits and comments before the PM moves the field. There is no separate sign-off ritual — VCS history is the audit trail.

## Slug rules

- Kebab-case (`semantic-search`, not `SemanticSearch` or `semantic_search`).
- Derived from the artifact's title or named explicitly when invoking the runbook.
- Once allocated, **never rename** — slugs become flag namespaces and tracker IDs.
- Initiative slugs are unique within the workspace; epic slugs are unique within an initiative; story slugs are unique within an epic.

## Approved-section immutability (per-run rule)

When a runbook re-renders an artifact:

- It **must not modify** sections marked `Approved` in the artifact's frontmatter or in a section-level annotation `<!-- approved -->`.
- It **may add** new sections in slots that didn't exist before.
- It **must preserve** PM edits between runs verbatim, even outside Approved sections, unless the PM explicitly says "regenerate".

If a runbook needs to change an Approved section, it must **refuse and explain** which section is locked and what conditions would unlock it (PM removes the marker).

## Path form for parent links

Frontmatter `parent:` fields and inline references use **paths relative to the artifact's location**:

- From the PRD: `./exploration.md`
- From an Epic: `../prd.md`
- From a Story: `../epic.md` and `../../prd.md`

Subagents resolve these literally. Don't use absolute paths.

## Tracker ID writeback

`/push` is the only writer for `Tracker ID`. Other runbooks read this field to print contextual info but never modify it.
