# Template — `.skill-lint.toml`

Annotated example config. Lives at repo root. Optional — the linter runs without it.

```toml
# .skill-lint.toml — config for plugins/skill-linting/scripts/lint.py
#
# Three tiers of suppression, in order from broadest to most precise.
# Use the most precise tier that covers your case. Every entry should
# ship with a `reason` — reviewers should question PRs that add
# suppressions without one.
#
#   Tier 1: [disable]                    repo-wide rule disables
#   Tier 2: [per_skill."<path>"]         skill-or-plugin-scoped disables
#   Tier 3: [[allow."<rule.id>"]]        per-instance allowlist
#                                        (for instance-based rules
#                                         like reference.depth)


# ---- Tier 1: repo-wide disables ----
# Use sparingly. Anything here applies to every skill.
[disable]
checks = [
    # Example: silence the third-person heuristic if it false-positives often.
    # "frontmatter.description.third-person",
]


# ---- Tier 2: per-skill / per-plugin disables ----
# Each entry should ship with a `reason`.

# Example: a skill whose body is intentionally long.
# [per_skill."plugins/architecture/skills/architecture-review"]
# disable = ["body.length"]
# reason = "phase definitions are load-bearing; factoring further breaks compaction recovery"

# Example: a plugin-level check disable. Path key is the plugin dir.
# [per_skill."plugins/publish"]
# disable = ["plugin.manifest.version.missing"]
# reason = "uses commit-SHA versioning by design"


# ---- Tier 3: per-instance allowlist ----
# Pins to (file, target) — semantic, not positional. Refactoring within
# the file doesn't invalidate the entry. Today only reference.depth is
# instance-based; future heuristic rules can opt in.
#
# Three fields are required: file, target, reason.

# Example: synthesis-with-citations. The synthesis file cites its source
# documents so readers can trace specific claims back to verbatim sources.
# [[allow."reference.depth"]]
# file = "plugins/publish/skills/publish-document/references/sharing.md"
# target = "targets.md"
# reason = "Synthesis-with-citations: sharing.md is the cross-target capability matrix; this is a provenance pointer, not a content chain."

# Example: fix-recipe pointer. An antipattern entry points at the canonical
# fix recipe — removing the link would force context-switch to SKILL.md.
# [[allow."reference.depth"]]
# file = "plugins/authoring/skills/skill-authoring/references/antipatterns.md"
# target = "description-design.md"
# reason = "Fix-recipe pointer: each Fix block points at the canonical pattern the reader needs to apply the fix."
```

## How to use

1. Copy this file to your repo root as `.skill-lint.toml`.
2. Uncomment and fill in only the entries you actually need.
3. Always provide a `reason` — it's documentation convention, not enforced today, but reviewers should treat it as mandatory.
4. Commit the file alongside the change that requires the suppression. A new entry without a corresponding skill change is a suspicious pattern.

## Picking the right tier

| Question | Answer | Use |
|---|---|---|
| Is the rule wrong for the entire repo? | Yes | Tier 1 (`[disable]`) |
| Does *this skill* have a structural exception, but the rule still applies to siblings? | Yes | Tier 2 (`[per_skill]`) |
| Is *this specific instance* legitimate (e.g., synthesis-with-citations) but other instances in the same file might be real findings? | Yes | Tier 3 (`[[allow.<rule>]]`) |
| Could the underlying issue be fixed instead of suppressed? | Yes | **Fix it.** Don't add a config entry. |

## Maintenance

- **Audit periodically.** Suppressions rot. Once a quarter (or every major skill rewrite), re-read the config and ask whether each entry is still needed.
- **Remove entries when the underlying issue is fixed.** A skill that was over-cap in v0.1 might be at-cap in v0.3; remove the disable.
- **Don't accumulate.** Hard rule of thumb: if `.skill-lint.toml` ever has more entries than your repo has skills, something's wrong with either the linter or your skill design.

## See also

- [`disabling-checks.md`](../references/disabling-checks.md) — full schema, anti-patterns, when disabling is appropriate vs. when to fix the underlying issue, the three patterns that warrant tier-3 (synthesis-with-citations, fix-recipe pointer, structural disclaimer + provenance).
- [`checks-reference.md`](../references/checks-reference.md) — every rule the linter emits, with the rule ID you'd put in `disable = […]` or `[[allow.<rule>]]`.
