---
description: Mirror an Epic and its Stories to whichever issue tracker the host project's AGENTS.md declares. Pure transport — never modifies requirements; surfaces field mismatches instead. Registers feature flags with the required runbook+test+cleanup-ticket triad. Writes back tracker IDs into artifact frontmatter. Tracker-agnostic — the runbook reads AGENTS.md and uses your general knowledge of the declared tracker (consulting vendor docs when uncertain).
argument-hint: <path-to-epic.md>
allowed-tools: Bash, Read, Edit, Glob, Grep, WebFetch
---

# /push — Tracker push runbook

You are running the **P4 — Tracker Push** subagent. The PM invokes you with `$ARGUMENTS` — the path to an `epic.md`.

This runbook is **pure transport**: it reads requirements artifacts and creates / updates issue-tracker items. It **never** modifies the requirements. If a tracker field doesn't fit the artifact's content, surface the mismatch and stop on that item — don't reword the artifact.

## The runbook is tracker-agnostic

This runbook does not name a specific tracker (Jira, Linear, GitHub Projects, Asana, Notion, Shortcut, …). The host project's `AGENTS.md` declares which tracker is in use, where it lives, and how its fields map to the framework's logical concepts (epic-link, flag-name, etc.). You — the agent — perform the API calls based on:

1. **What `AGENTS.md` declares** — type, host, credentials env-var names, project key, issue-type names, field-mapping table, any project-specific notes.
2. **Your general knowledge** of that tracker's API.
3. **Authoritative vendor docs** (via `context7` or `WebFetch`) when you are uncertain about a current API shape, payload requirement, or field semantics. Prefer this over guessing.

If `AGENTS.md` declares a tracker you do not know how to drive (and vendor docs are not reachable), surface `[BLOCKED: tracker type "{type}" not known and vendor docs not reachable; PM to provide API docs or switch to a known tracker]` and stop.

## Pre-flight

1. **Load the prdspec skill:** `${CLAUDE_PLUGIN_ROOT}/skills/prdspec/SKILL.md`.
2. **Load the verb→tool binding:** `${CLAUDE_PLUGIN_ROOT}/skills/prdspec/tools.md`.
3. **Load conventions:**
   - `${CLAUDE_PLUGIN_ROOT}/skills/prdspec/conventions/frontmatter.md`
   - `${CLAUDE_PLUGIN_ROOT}/skills/prdspec/conventions/no-fabrication.md`
   - `${CLAUDE_PLUGIN_ROOT}/skills/prdspec/conventions/parent-chain.md`
   - `${CLAUDE_PLUGIN_ROOT}/skills/prdspec/conventions/flag-naming.md`
4. **Read AGENTS.md** at workspace root. Specifically the blocks the runbook depends on:
   - `tracker:` — declares the issue tracker. Required.
   - `flags:` — declares the feature-flag platform. Optional; if absent, skip flag registration and surface that.
   - `repo:` — VCS URL pattern (used to link from tracker description back to the artifact in the workspace).
   - `dod:` — project-specific Definition-of-Done items (read-only; informational).

## Step 1 — Load artifacts

1. Resolve `$ARGUMENTS` to the Epic path. Read it.
2. **Verify Status:** Epic Status must be `Ready` or later. Story Status must be `Ready` or later for inclusion.
   - If Epic is `Draft`, stop: `[BLOCKED: Epic Status is "Draft"]`.
   - If some Stories are still `Draft`, list them and ask: "Push only Ready stories, or wait?"
3. **Walk the parent chain:** load the parent PRD via `parent: ../prd.md`. Read its frontmatter and §1, §4, §5, §10 — enough context to populate the tracker Epic description.
4. **List stories:** `<epic-dir>/stories/*.md`. Read each story's frontmatter and §1 (User statement), §5 (Acceptance criteria), §8 (Flag wiring).

## Step 2 — Verify tracker reachability and credentials

The shape of this step depends on what `AGENTS.md` `tracker:` declares. The general protocol is:

1. **Resolve credentials** — `tracker.credentials_env` names environment variables. Read them. If any required variable is empty, surface `[BLOCKED: tracker credentials not set — set {VAR_NAMES} per AGENTS.md and re-run]` and stop.
2. **Reachability check** — make the simplest authenticated call the tracker supports (e.g., a "current user" or "ping" endpoint). Use your knowledge of that tracker; if uncertain, consult vendor docs first. Expect a success response.
3. **Project / workspace existence check** — confirm the project / team / workspace declared in `AGENTS.md` `tracker.project_key` (or its equivalent) exists and is reachable.
4. **If any check fails**, surface the failure and stop. Do not proceed to writes.

If the verb→tool binding (`tools.md`) and `AGENTS.md` together don't tell you how to make these checks for the declared tracker, surface `[GAP: don't know how to verify {tracker_type}; need vendor doc URL or sample call shape in AGENTS.md or via context7]` and stop.

## Step 3 — Idempotency check

For each artifact (Epic + every Story being pushed):

- Read the `Tracker ID:` frontmatter field.
- If non-empty: this is an **update**. Fetch the issue from the tracker, prepare the field changes you'll write.
- If empty: this is a **create**. Prepare the create payload.

**Never** create a duplicate issue. If the artifact has a Tracker ID and the tracker returns "not found" for it, surface and stop — do not silently create a replacement.

## Step 4 — Push the Epic

### 4.1 Build the field map

The framework's logical concepts → tracker fields, sourced from `AGENTS.md` `tracker.field_mappings`:

| Framework concept | Where it lives in the artifact | Tracker field |
|---|---|---|
| Title | `# Epic: {...}` H1 | The tracker's "summary" or "title" field |
| Description | §1 (Release note + paragraphs) and §4 (Solution shape) | The tracker's "description" field, in whatever format the tracker accepts (plain text, Markdown, ADF, etc.) |
| Issue type | n/a (constant) | `tracker.issue_types.epic` |
| Project / team / workspace | n/a (constant) | `tracker.project_key` (or the tracker-specific equivalent) |
| Assignee | Frontmatter `DRI:` (`@handle`) | The tracker's assignee field; resolve `@handle` to the tracker's user identifier (some trackers expose a search-by-username endpoint) |
| Target rollout window | Frontmatter `Target rollout window:` | `tracker.field_mappings.target_window` |
| Slug | Frontmatter `Slug:` | `tracker.field_mappings.slug` (if declared); otherwise embed in summary as `[{slug}] {title}` |
| Flag name | Epic §6 Flag name | `tracker.field_mappings.flag_name` (if declared); otherwise mention in description |
| Parent PRD link | Resolve PRD via `parent:` field; use its Tracker ID if present | A "parent issue" / "epic of" relationship if the tracker supports it; otherwise mention in description |

If a `field_mappings` entry the framework would benefit from is missing, surface `[GAP: tracker field "{concept}" not declared in AGENTS.md.field_mappings — proceed without it? (yes / fix AGENTS.md)]`. Do not invent a field ID.

### 4.2 Render the description

Render the Epic description in whatever format the declared tracker accepts. If you are uncertain whether the tracker accepts plain Markdown or requires a rich-text format (Atlassian Document Format, Linear's prosemirror JSON, GitHub's GFM, Notion blocks, etc.), consult vendor docs via `context7` or `WebFetch` before submitting.

Description content (in order):

1. A link from the tracker back to the artifact in the workspace VCS. Use `AGENTS.md` `repo:` block to construct the URL pattern; if `repo:` is absent, fall back to a relative path note.
2. The §1 paragraphs and §4 Solution shape **verbatim**. The artifact is the source of truth; the tracker is a mirror.
3. (Optional) A note that this issue was generated by `/push` and that the workspace artifact remains canonical. Wording matters less than the link in step 1.

Do not summarize the Epic. Do not "translate" the artifact. The description is a mirror, not a derivative.

### 4.3 Create or update

Make the API call(s) per the tracker's documented protocol. Capture:

- The new (or existing) issue's identifier / key.
- A canonical URL to the issue (most trackers expose a `browse/{key}` or similar route).

### 4.4 Write back

`str_replace` on the Epic's frontmatter line `Tracker ID:`. Replace the placeholder with a Markdown link to the issue, formatted as `> **Tracker ID:** [{KEY}](<canonical-url>)`. The exact field name in the artifact is `Tracker ID:` regardless of what the tracker calls it.

## Step 5 — Push each Story

For each Story (one issue per file):

### 5.1 Build the field map

Same pattern as the Epic, with Story-specific concepts:

| Framework concept | Source | Tracker field |
|---|---|---|
| Title | `# Story: {...}` H1 | summary / title |
| Description | §1 user statement, §5 AC's, §6 edge cases, §7 DoD, §8 flag wiring — rendered in the tracker's format | description |
| Issue type | constant | `tracker.issue_types.story` |
| Assignee | `Implementer:` first, fall back to `DRI:` | assignee |
| Estimated size | Frontmatter `Estimated size:` | `tracker.field_mappings.size` if declared; otherwise omit |
| Parent Epic | Epic's Tracker ID (just written in Step 4) | The tracker's epic-link / parent-issue field (`tracker.field_mappings.epic_link` if needed) |
| `Depends on:` siblings | Resolve sibling slugs to their Tracker IDs (must already be pushed) | A "blocks" / "is-blocked-by" relationship |

### 5.2 Order of operations

Push stories in **dependency order** (sibling-graph topological order from `Depends on:` frontmatter) so blocking links can resolve. If there's a cycle, stop with `[BLOCKED: Story dependency cycle detected: {slugs}]`.

If a depended-on sibling has no Tracker ID (e.g., it was Draft and skipped), surface `[GAP: story X depends on Y; Y not pushed; create the link manually or push Y first]` and continue with the rest.

### 5.3 Create / update + write back

Same shape as the Epic. Write the Tracker ID URL back into the Story's frontmatter.

## Step 6 — Register flags

Driven by `AGENTS.md` `flags:` block. The block declares the platform (LaunchDarkly, Split, Unleash, Statsig, an in-repo `flags.yml`, etc.), the host, and credentials. The same agnostic principle applies: this runbook does not name a flag platform; you read the declaration and act.

If the `flags:` block is absent, surface `[GAP: AGENTS.md has no flags: block — flag registration skipped. Register manually or add a flags: declaration]` and **continue with the rest of the push**. Flag registration is independent of issue creation.

### 6.1 Verify the required triad

For each flag (the Epic flag, plus any sub-flags declared in Stories §8), all three must exist before registration:

1. **Runbook entry** — Epic §6 names a kill-switch runbook URL. Verify reachable (`verify anchor`). If absent or unreachable, surface `[BLOCKED: kill-switch runbook missing for flag {name}]` and skip this flag.
2. **Kill-switch test** — Epic §6 names a test path. Verify it exists in the workspace. If not, `[BLOCKED: kill-switch test "{path}" not found for flag {name}]` and skip.
3. **Cleanup ticket** — create a tracker issue **first**, then register the flag with the cleanup-ticket key in its metadata. The cleanup ticket: title `Cleanup flag {flag-name}`, description linking the flag and the runbook, due date = (Epic target rollout window end + 4 weeks) per `conventions/flag-naming.md` cleanup discipline.

### 6.2 Register the flag

Make the API call(s) per the declared platform. Payload (logical):

- Flag key / name.
- Default state: `off`.
- Owner (from frontmatter / `AGENTS.md` `owners:` defaults).
- Runbook URL.
- Kill-switch test path.
- Cleanup ticket key.

If the flag already exists in the platform, fetch and verify metadata matches what we'd register. If not, surface the diff — do not silently overwrite.

If you do not know the declared flag platform's API (and vendor docs are not reachable), surface `[GAP: don't know how to register flags on platform "{type}"; PM to provide API docs or use a known platform]` and continue without registering this flag.

### 6.3 Note the registration

The flag-platform URL becomes a comment in the Epic's tracker description (or a custom field if `tracker.field_mappings.flag_url` is declared). The artifact files are not modified — `Flag name:` already lives in Epic §6.

## Step 7 — Report

```text
Pushed:
  Epic: {key} — {url}
  Stories ({count}):
    - {story-slug} → {key} — {url}
    - ...
  Flags registered:
    - {flag-name} → cleanup ticket {key}
    - ...

Gaps surfaced (not pushed):
  - {gap}
  - ...

Next steps:
  - Review tracker items for accuracy.
  - Stories ready for implementer pickup.
  - Cleanup tickets are scheduled; flag lifecycle automation (if any) takes over.
```

## Iteration rules

- Re-running `/push` on the same Epic is idempotent — it updates existing tracker items rather than creating duplicates.
- If the PM has changed an artifact and re-pushed, the corresponding tracker fields update. The PM **never** edits the tracker description by hand — that drift would be silently overwritten on the next push, and the framework's source of truth is the artifact files.
- If a tracker item has been edited outside this runbook (description manually edited), the next push **detects** the divergence and asks the PM to choose: overwrite tracker, update artifact, or skip this item.

## What this runbook does not do

- It **does not** modify the artifacts' content. Frontmatter Tracker ID writeback is the only artifact mutation.
- It does not move Status fields. The PM continues to own those.
- It does not transition tracker items beyond create/update. Workflow transitions (e.g., "Ready" → "In progress") happen in the tracker manually or via separate automation.
- It does not register sub-flags speculatively. Only flags that exist in the artifacts (Epic §6 + any Story §8 sub-flag declarations) are registered.
- It does not pick a tracker. The host project's `AGENTS.md` does. Adding support for a new tracker requires no changes to this runbook — it requires updating `AGENTS.md` (and possibly your knowledge of that tracker via vendor docs).
