# Disabling checks responsibly

The linter has one configuration file: `.skill-lint.toml` at repo root. Three tiers of granularity, in order from broadest to most precise:

- **Tier 1** — `[disable]` — repo-wide rule disables.
- **Tier 2** — `[per_skill."<path>"]` — skill-or-plugin-scoped disables.
- **Tier 3** — `[[allow."<rule.id>"]]` — per-instance allowlist for rules that fire multiple times within one file.

Use the most precise tier that covers your case. Every entry should ship with a `reason` — reviewers should question PRs that add suppressions without one.

## Contents

- [When disabling is appropriate](#when-disabling-is-appropriate)
- [Tier 1: repo-wide disables](#tier-1-repo-wide-disables)
- [Tier 2: per-skill / per-plugin disables](#tier-2-per-skill--per-plugin-disables)
- [Tier 3: per-instance allowlist](#tier-3-per-instance-allowlist)
- [Disable hierarchy and resolution](#disable-hierarchy-and-resolution)
- [Anti-patterns — when *not* to disable](#anti-patterns--when-not-to-disable)
- [No per-line escapes](#no-per-line-escapes)
- [Discovering active disables](#discovering-active-disables)

## When disabling is appropriate

Three legitimate reasons to disable a check:

1. **The rule is heuristic and the heuristic mis-fires** — e.g., a description starting with a verb that the third-person regex misreads.
2. **The skill has a structural exception with a real reason** — e.g., a skill whose body is intentionally long because phase definitions are load-bearing.
3. **The cost of compliance exceeds the benefit for this specific skill** — and you can articulate why in a `reason` line.

Three illegitimate reasons:

1. **"It's annoying."** That's what the rule is supposed to be — annoying enough that you fix it. If a rule fires often without real exceptions, the rule is wrong; tighten or remove it from `lint.py`.
2. **"We'll fix it later."** Disable entries rot. Either fix it now or open a ticket.
3. **"It's just for this PR."** PRs should ship with the disable removed. If you genuinely need a temporary disable, the workflow is to commit + ship + revert in the same series — not to leave a disable in `main`.

## Tier 1: repo-wide disables

Use when a rule is genuinely wrong for the whole repo. Rare. Most common reason: a heuristic rule false-positives across many skills and the heuristic can't be tightened.

```toml
[disable]
checks = ["rule.id.1", "rule.id.2"]
```

This silences the listed rules across every skill and every plugin. Treat it as the loudest declaration of "we won't follow this rule in this repo."

## Tier 2: per-skill / per-plugin disables

Use when a single skill (or plugin) has a structural exception that doesn't apply to siblings.

```toml
[per_skill."<plugin>/skills/<skill>"]
disable = ["rule.id"]
reason = "<short justification — convention, not enforced today>"
```

Example:

```toml
[per_skill."plugins/architecture/skills/architecture-review"]
disable = ["body.length"]
reason = "phase definitions are load-bearing; factoring further breaks compaction recovery"
```

### Path-key syntax

The path key is the relative path to the skill *directory* (parent of `SKILL.md`) — or to the plugin directory for manifest-level checks. Forward slashes regardless of OS. Leading `./` is tolerated but not required.

```toml
[per_skill."plugins/architecture/skills/architecture-review"]    # OK
[per_skill."./plugins/architecture/skills/architecture-review"]  # also OK
[per_skill."plugins/.../SKILL.md"]                               # WRONG — points to file
```

### Plugin-level disables (manifest checks)

For checks that fire on `plugin.json` or `marketplace.json`, the path key is the plugin directory rather than a skill directory:

```toml
[per_skill."plugins/<plugin>"]
disable = ["plugin.manifest.version.missing"]
reason = "this plugin uses commit-SHA versioning intentionally"
```

(The table name `[per_skill]` is slightly misleading for plugin-scope; `lint.py` treats both skill and plugin paths as scoping keys.)

## Tier 3: per-instance allowlist

Use when a single file contains multiple instances of a rule violation, and *some* instances are legitimate exceptions while others would be real findings. Today only `reference.depth` is instance-based. Future heuristic rules can opt in.

The allowlist pins to a `(file, target)` pair — semantic, not positional. Refactoring within the file (reordering paragraphs, adding sections) doesn't invalidate the entry. Modeled on `vulture`'s allowlist pattern.

```toml
[[allow."<rule.id>"]]
file = "<path/to/source/reference.md>"
target = "<linked-filename.md>"
reason = "<which legitimate pattern this instance represents>"
```

Three fields are required (`file`, `target`, `reason`). The `reason` field is **documentation convention** — `lint.py` doesn't read it today, but every entry should have one.

### When tier-3 allowlist is the right answer

The check is doing its job — flagging a deviation from Anthropic's modeled practice. You're saying "yes, this specific instance is intentional, here's why."

Common patterns that warrant tier-3 entries for `reference.depth`:

**Synthesis-with-citations** — one reference is a synthesis of others. Cross-references are *provenance pointers* letting readers verify specific cells against verbatim source material. Without the citations, the synthesis becomes "trust me."

> Example: `publish-document/references/sharing.md` is a cross-target capability matrix; the cross-references to `targets.md` and `cli-fallbacks.md` let a reader trace any specific cell ("Notion can't grant link-edit?") back to its verbatim source.

**Fix-recipe pointer** — an antipattern catalog (or rule list) where each entry pairs the problem with a Fix line. The Fix points at the canonical recipe in another reference. Removing the link forces context-switch to `SKILL.md` to find the recipe.

> Example: `skill-authoring/references/antipatterns.md` Fix lines pointing at `description-design.md` for the canonical pattern.

**Structural disclaimer + provenance** — a section enumerates rules that come from outside the canonical source (e.g., repo-specific conventions vs. Anthropic spec rules). The cross-reference attributes provenance and prevents the reader from mistaking categories.

> Example: `skill-authoring/references/structural-rules.md` "repo-specific invariants" section pointing at `repo-conventions.md` for the rationale.

### Worked example: this repo's allowlist

```toml
# antipatterns.md → description-design.md
# Fix-recipe pointer pattern: lines 22 and 46 each point at the canonical
# pattern needed to apply the fix.
[[allow."reference.depth"]]
file = "plugins/authoring/skills/skill-authoring/references/antipatterns.md"
target = "description-design.md"
reason = "Fix-recipe pointer pattern: appears twice in this file (lines 22, 46). Each Fix block points at the canonical recipe (five-element pattern, measurement snippet) the reader needs to apply the fix. Removing the link would force context-switch to SKILL.md."

# structural-rules.md → repo-conventions.md
[[allow."reference.depth"]]
file = "plugins/authoring/skills/skill-authoring/references/structural-rules.md"
target = "repo-conventions.md"
reason = "Structural disclaimer + provenance pointer: this section enumerates repo-specific invariants (vs. Anthropic spec rules in earlier sections); the link tells readers where the rationale lives so they don't mistake repo conventions for spec rules."
```

The actual `.skill-lint.toml` at repo root holds these entries.

### When *not* to use tier 3 — refactor instead

If the cross-reference is a courtesy "for more, see X" pointer, refactor rather than allowlist:

- **Drop the link entirely** — readers can find the sister reference from `SKILL.md`. Often the simplest fix.
- **Mention by name without a markdown link** — e.g., *"the handoff details live in `eval-loop.md` (linked from SKILL.md)"*. Preserves discoverability via grep without tripping the linter.
- **Inline the linked content** — if it's small, just include it.
- **Restructure to hub-and-spoke** — let `SKILL.md` link both files directly so neither needs to point at the other.

If you can't articulate a structural reason for the link (synthesis, fix-recipe, provenance), it's probably a courtesy — refactor it.

## Disable hierarchy and resolution

When a check would emit a finding, the linter consults suppressions in this order:

1. **Tier 3 — per-instance allowlist** (only for instance-based rules; today `reference.depth`). If the `(file, target)` matches an `[[allow."<rule>"]]` entry, the finding is suppressed.
2. **Tier 2 — per-skill / per-plugin disable**. If the rule appears in `[per_skill."<path>"] disable = [...]` and the finding is under that path, suppressed.
3. **Tier 1 — repo-wide disable**. If the rule appears in `[disable] checks = [...]`, suppressed.

If any tier hits, the finding is suppressed silently. The linter does not yet log suppressed findings (planned for v0.2: `--show-suppressed`).

## Anti-patterns — when *not* to disable

### Disabling `frontmatter.description.length` repo-wide

The 1024-char cap is spec. Disabling it means descriptions silently truncate in production. Always fix the description.

### Disabling `marketplace.plugin.version-sync` per-skill

Drift between `plugin.json` and `marketplace.json` causes inconsistent installations. The fix is mechanical (bump both files); disabling is never right.

### Disabling `reference.depth` repo-wide

Anthropic's own skills follow hub-and-spoke (no sibling cross-references). A repo-wide disable says "we won't follow Anthropic's house style" — possibly defensible, but commit to the reason. If many skills trip the rule, restructuring toward hub-and-spoke is usually cheaper than a permanent disable.

### Disabling `reference.orphan` per-skill without removing the orphan

Orphan references never load via progressive disclosure. If a reference is genuinely orphan, delete it; if it's needed, link it from `SKILL.md` or the plugin README.

## No per-line escapes

The linter intentionally has no `<!-- noqa: <rule-id> -->` per-line mechanism. Two reasons:

1. **Decision auditability.** Disabling a check is a structural decision — it deserves to live in version-controlled config with a `reason`, not in markdown bodies where reviewers might miss it.
2. **Token-cost in Claude's context.** Skills are loaded into Claude's context when they trigger. Per-line `noqa` comments would pollute that context with linter metadata. The linter aims to keep skill content clean — pure progressive-disclosure surface.

If a check is firing on a legitimate exception, capture it in `.skill-lint.toml`. If a rule is wrong often enough that it needs many disables, the rule itself is the problem — change `lint.py`.

## Discovering active disables

To audit current disables:

```bash
cat .skill-lint.toml 2>/dev/null
```

Treat the file as code-review-worthy — every entry is an exception that lives until someone removes it. When reviewing a PR that adds an entry, ask: "Could this be fixed instead of disabled?"
