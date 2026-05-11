# Convention: feature flag naming and lifecycle

The framework is **flag-native**: every PRD has a top-level flag, every Epic has its own flag, Stories inherit the Epic flag (sub-flags only when a story needs independent rollout). Flags are part of the contract, not a delivery afterthought.

## Naming

```
{prd_slug}.{epic_slug}[.{story_slug}]
```

Lowercase, dot-separated, no spaces, no hyphens within a slug segment beyond what's already in the kebab-case slug. If a slug already has hyphens (e.g., `semantic-search`), the dots remain the segment separator:

```
shift.semantic_search                      ← top-level (PRD)
shift.semantic_search.jira_connector       ← epic flag
shift.semantic_search.jira_connector.oauth ← rare; story sub-flag
```

> Note: the framework spec in `requirements-framework.md` uses `semantic_search` (underscore) inside a flag name even though slugs are kebab-case. Flag platforms commonly disallow hyphens in identifiers — translate kebab-case slugs to snake_case for flag names. The slug itself stays kebab-case in filenames and frontmatter.

## Lifecycle states

```
off → dev → internal → beta → ga_opt_in → ga_default → cleanup → removed
```

Each transition has entry criteria. PRD §10 defines the per-phase audience and exit criteria; an Epic's §6 inherits PRD §10 unless this epic ships on a different cadence (override there, not silently).

## Required at flag creation

Every new flag, registered by `/push` when the Epic is mirrored to the tracker:

1. **Runbook entry** — link to the kill-switch runbook and customer comms template (PRD §10).
2. **Kill-switch test** — automated test verifying the off-state behavior in the Epic §6 description.
3. **Paired cleanup ticket** — must exist before the flag is merged to main. `/push` registers the cleanup ticket alongside the flag.

If any of the three is missing, `/push` surfaces the gap rather than registering a half-baked flag.

## Cleanup discipline

A flag at `ga_default` for **≥ 4 weeks** with no rollbacks moves to `cleanup` automatically. Prevents the slow accumulation of dead flags.

Cleanup means: removing the flag check from code, deleting the flag from the platform, closing the cleanup ticket. The runbook does not perform cleanup — it just registers and surfaces.

## Sub-flags are the exception

If every story under an epic gets its own sub-flag, the epic is **too large** — re-slice it. Sub-flags exist for genuinely independent rollout cases:

- A story that ships behind a different audience cohort than the epic (e.g., enterprise-only when the epic is general).
- A story that ships earlier than the rest of the epic for de-risking.

When in doubt, no sub-flag.

## Where the flag check goes (Story §8 wiring)

Specific. Not a vague "behind a flag." The Story's §8 names the **file:line** where the flag check belongs (entry point of the new code path; UI rendering guard) and the **off-state behavior** (not just "hidden" — say what users see and what the API returns).

If the implementer would need to guess where the flag check goes, the wiring is not specific enough.
