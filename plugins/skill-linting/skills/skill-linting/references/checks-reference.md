# Checks reference — every rule the linter enforces

Canonical catalog of every check `lint.py` runs, organized by tier. For each rule: rule ID (the string the linter emits), severity, what it catches, why it matters, how to fix, and how to disable.

## Contents

- [How to read this catalog](#how-to-read-this-catalog)
- [Tier 1 — Errors (block CI / pre-commit)](#tier-1--errors-block-ci--pre-commit)
- [Tier 2 — Warnings (surface, don't block)](#tier-2--warnings-surface-dont-block)
- [Cross-cutting: I/O and parsing](#cross-cutting-io-and-parsing)
- [Disabling rules](#disabling-rules)

## How to read this catalog

Each entry uses this shape:

> **rule-id** — *severity*. What it catches. Why it matters. How to fix. How to disable.

Rule IDs are stable strings — pin them in `.skill-lint.toml` and `noqa` comments. Severities are `error` (tier 1) or `warning` (tier 2). The linter currently has no `info`-level rules.

## Tier 1 — Errors (block CI / pre-commit)

Mechanical, unambiguous, deterministic.

### Frontmatter

**`frontmatter.missing`** — *error*. SKILL.md does not start with `---`-delimited YAML frontmatter.
*Why:* the spec requires frontmatter; without it Claude can't see the skill's `name` or `description` and won't load the skill.
*Fix:* add a frontmatter block at the top of the file with at minimum `name:` and `description:`.
*Disable:* not disable-able. This is structural.

**`frontmatter.name.missing`** — *error*. Frontmatter has no `name` field, or `name` is empty.
*Why:* spec requires `name`. Skill installation fails without it.
*Fix:* add `name: <slug>` to the frontmatter, where `<slug>` matches the parent directory name.

**`frontmatter.name.length`** — *error*. `name` exceeds 64 characters.
*Why:* Anthropic [best-practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) caps name length at 64.
*Fix:* shorten the name. Generic suffixes like `-helper` are usually droppable.

**`frontmatter.name.format`** — *error*. `name` contains characters outside `[a-z0-9-]`, or doesn't start/end with `[a-z0-9]`.
*Why:* spec restricts the charset. Slashes, underscores, capitals, dots all break installation.
*Fix:* lowercase, replace separators with single hyphens.

**`frontmatter.name.consecutive-hyphens`** — *error*. `name` contains `--`.
*Why:* per `agentskills.io` spec.
*Fix:* use single hyphens.

**`frontmatter.name.reserved`** — *error*. `name` is `anthropic` or `claude`.
*Why:* reserved by Anthropic.
*Fix:* pick a different name.

**`frontmatter.name.parent-dir-mismatch`** — *error*. `name` doesn't equal the directory the file sits in.
*Why:* spec requires they match — Claude Code uses both for skill resolution; drift causes install/lookup ambiguity.
*Fix:* rename either the directory or the `name` field. Preserving install IDs (if anyone has installed the skill already) usually means changing whichever is wrong.

**`frontmatter.description.missing`** — *error*. No `description` field, or empty.
*Why:* spec requires it; Claude has no signal to invoke the skill without it.
*Fix:* write a description following the five-element pattern in `skill-authoring/references/description-design.md`.

**`frontmatter.description.length`** — *error*. `description` exceeds 1024 characters.
*Why:* Anthropic spec hard cap.
*Fix:* trim by the over-cap delta. Drop redundant adjectives, merge clauses, factor methodology detail into the body.

**`frontmatter.description.xml`** — *error*. `description` contains `<tag>` syntax.
*Why:* the description is injected into Claude's system prompt (which is XML-formatted); stray tags can break parsing.
*Fix:* replace `<placeholder>` with `{placeholder}`, `[placeholder]`, or quoted prose. *This includes documentation-style placeholders* — Anthropic's spec is strict on this.

**`frontmatter.combined.length`** — *error*. Combined `name` + `description` + `when_to_use` exceeds **1,536 characters** — the documented Claude Code per-listing cap.
*Why:* this is a hard spec violation. Claude Code [explicitly truncates](https://code.claude.com/docs/en/skills) any listing entry whose combined text exceeds 1,536 chars. Above the cap the listing entry is *guaranteed* to truncate mid-sentence — the exclusion clause (often at the tail) gets sliced off. The check sums all three fields because the listing entry concatenates them; `when_to_use` (when present) is appended to `description` per the docs.
*Fix:* trim the description or `when_to_use` by the over-cap delta. The linter prints the per-field breakdown so you know which is the longer one.

**`frontmatter.combined.margin`** — *warning*. Combined `name` + `description` + `when_to_use` is between **1100 and 1,536 characters**.
*Why:* the 1,536 cap is the hard truncation point, but the actual budget is dynamic — Claude Code allocates "1% of the context window, fallback 8,000 chars" across all loaded skills. Under context-budget pressure (many skills loaded, large conversation), listing entries can truncate well before the hard cap. The 1100-char target is our prudent margin to avoid surprise truncation. Surveying Anthropic's own skills, every public skill description sits comfortably below this margin.
*Fix:* trim to ≤1100 chars combined. If you can't, the description likely encodes too much — factor methodology detail into the body, or split trigger phrasings into `when_to_use` (still counts toward the combined cap, but separating "what" from "when" can help readability).
*Disable:* per-skill via `.skill-lint.toml` if a skill genuinely needs the extra ~400 chars of trigger surface (rare). Be specific in the `reason`.

### Body

**`body.length`** — *error*. SKILL.md body (after closing frontmatter `---`) exceeds 500 lines.
*Why:* Anthropic best-practices recommend ≤500 lines for tier-2 budget. Bodies over this limit also degrade compaction recovery (only the first 5K tokens re-attach).
*Fix:* factor topics into `references/`. Don't compress prose — split it. The body should be operating procedure; references hold deep-dives.

### Plugin manifest

**`plugin.manifest.missing`** — *error*. Plugin directory has no `.claude-plugin/plugin.json`.
*Why:* required for the plugin loader to recognize it.
*Fix:* create the manifest from `templates/plugin-manifest.md` in `skill-authoring`.

**`plugin.manifest.parse`** — *error*. `plugin.json` is invalid JSON.
*Why:* loader can't read it.
*Fix:* validate with `python3 -m json.tool plugin.json`. Common causes: trailing commas, unescaped quotes.

**`plugin.manifest.name.missing`** — *error*. `plugin.json` has no `name`.

**`plugin.manifest.name.dir-mismatch`** — *error*. `plugin.json` `name` doesn't equal the plugin directory name.
*Why:* the marketplace `source` path uses the directory name; `name` is what users invoke. Drift breaks installation.
*Fix:* rename one to match the other.

**`plugin.manifest.version.missing`** — *error*. `plugin.json` has no `version`.
*Why:* without an explicit version, the commit SHA becomes the version (per the Claude Code plugins page) and every commit appears as a new version. That's almost never what you want for a published plugin.
*Fix:* add `"version": "0.1.0"` (or your starting semver).

### Marketplace manifest

**`marketplace.missing`** — *error*. No `.claude-plugin/marketplace.json` at repo root.
*Why:* Claude reads this first; it's the marketplace's entry point.
*Fix:* create one. See [`templates/skill-md-skeleton.md`](../../authoring/skills/skill-authoring/templates/) in skill-authoring for shape.

**`marketplace.parse`** — *error*. `marketplace.json` is invalid JSON.
*Why:* same as `plugin.manifest.parse`.

**`plugins.dir.missing`** — *error*. No `plugins/` directory at repo root.
*Why:* `marketplace.json` `metadata.pluginRoot` points there.

**`marketplace.plugin.unregistered`** — *error*. A plugin exists on disk under `plugins/<name>/` but has no entry in `marketplace.json` `plugins[]`.
*Why:* the plugin is undiscoverable from the marketplace.
*Fix:* add the entry. Use `templates/plugin-manifest.md` in `skill-authoring` as a template.

**`marketplace.plugin.dangling`** — *error*. A `marketplace.json` entry references a plugin that doesn't exist on disk.
*Why:* `/plugin install` fails with a confusing error.
*Fix:* either remove the entry, or create the plugin directory it claims to register.

**`marketplace.plugin.source`** — *error*. A marketplace entry's `source` is not `./plugins/<name>`.
*Why:* the loader resolves relative to repo root using `pluginRoot`. Wrong paths break installation.
*Fix:* set `source` to `./plugins/<name>`.

**`marketplace.plugin.version-sync`** — *error*. A plugin's `plugin.json` `version` differs from its marketplace entry's `version`.
*Why:* installations resolve one or the other inconsistently. Drift = silent breakage.
*Fix:* bump both files to the same version in one commit. The (planned) `--fix` mode could automate this once we decide which value is canonical.

## Tier 2 — Warnings (surface, don't block)

Heuristic or judgment-shaped. The `--strict` flag promotes them to errors.

### Description (heuristic)

**`frontmatter.description.third-person`** — *warning*. Description starts with a 1st/2nd-person token: `I `, `I'`, `You `, `You'`, `We `, `Let me `, `Helps you `, `This skill `, `A skill `.
*Why:* Anthropic best-practices: "The description is injected into the system prompt, and inconsistent point-of-view can cause discovery problems." Third-person verb forms read as capability statements.
*Fix:* rewrite as `Authors and reviews…`, `Processes…`, `Generates…`. The body is second-person; only the description is third-person.
*Disable:* `[disable] checks = ["frontmatter.description.third-person"]` in `.skill-lint.toml` if you have a legitimate exception.
*Known false-positive risk:* descriptions starting with a noun phrase (rare) might trip "This skill " detection. Re-read the rule list — tighten the regex if you find a pattern.

**`frontmatter.description.exclusion-clause`** — *warning*. Description doesn't contain `Not for…`, `Do not use for…`, `Does not trigger…`, or `Does NOT trigger…`.
*Why:* without an exclusion clause, the skill over-fires on adjacent tasks. The community calls this the most important line in the description ([Generative Programmer](https://generativeprogrammer.com/p/skill-authoring-patterns-from-anthropics)).
*Fix:* end the description with `Not for X, Y, or Z.` naming 3–5 plausible near-misses.
*Disable:* per-skill or repo-wide via `.skill-lint.toml`. Disabling repo-wide is generally a mistake; disable per-skill if a skill has no realistic near-miss.

### References

**`reference.toc.missing`** — *warning*. A reference file is >100 lines and has no `## Contents` (or `## Table of contents`) heading in the first 30 lines.
*Why:* per Anthropic best-practices, "Claude may partially read files when they're referenced from other referenced files… resulting in incomplete information." A TOC ensures the full scope is visible even on partial reads.
*Fix:* add `## Contents` with bullet links to each H2 heading near the top.
*Disable:* per-skill if the file is intentionally read-as-a-whole (rare).

**`reference.depth`** — *warning*. A reference file links to another reference file in the same directory.
*Why:* Anthropic's [best-practices page](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) forbids content chains where substantive content lives at depth 2+. The literal rule allows sibling "see also" pointers, but Anthropic's *own example skills* (`pdf`, `xlsx`, `docx`, `pptx`, `mcp-builder`, `webapp-testing`, `skill-creator`) contain **zero** markdown cross-links between sibling references. They follow a pure hub-and-spoke pattern: SKILL.md links every reference; references don't link each other. The warning surfaces deviation from that house style.
*Fix (preferred):* inline the linked content into the current file, or restructure so SKILL.md links both files directly and the cross-reference becomes unnecessary. The hub-and-spoke pattern is what Anthropic models; matching it is the default.
*Fix (alternative):* if the cross-reference is genuinely the best design (rare — e.g., a glossary entry shared by multiple topic refs), disable per-skill in `.skill-lint.toml` with a `reason`.
*Disable:* per-skill via `.skill-lint.toml` only. There is no per-line escape hatch — every cross-reference deserves a real disposition.

**`reference.orphan`** — *warning*. A reference file is not linked from `SKILL.md` or the plugin's `README.md`.
*Why:* progressive disclosure depends on `SKILL.md` (or a transitively-loaded reference) pointing at every reference. Orphans never load.
*Fix:* add a link from `SKILL.md` (preferred) — typically in the "Reference & template files" section. The plugin README also counts.
*Disable:* there's no good reason to keep an orphan reference; either link it or delete it.

## Cross-cutting: I/O and parsing

These can fire at any tier; treat them as fatal-style issues that prevent further analysis.

**`io.read`** — *error*. The linter couldn't read a file (permissions, missing, etc.).
*Fix:* check the path and permissions.

## Disabling rules

Single mechanism: `.skill-lint.toml` at repo root.

```toml
# Disable repo-wide
[disable]
checks = ["frontmatter.description.exclusion-clause"]

# Disable per-skill
[per_skill."plugins/architecture/skills/architecture-review"]
disable = ["body.length"]
reason = "phase definitions are load-bearing; factoring further breaks compaction"
```

The path key under `per_skill` is the relative path to the skill directory (the parent of `SKILL.md`). The `reason` field is a documentation convention — not enforced by `lint.py` today, but reviewers should question disables that lack one.

There is no per-line escape hatch (`noqa`-style). The decision to disable a check is a structural one and belongs in version-controlled config, not scattered through markdown bodies. Inline `noqa` comments would also pollute Claude's context every time the reference loads — the linter aims to keep skill content clean.

The `disabling-checks.md` reference (linked from `SKILL.md`) covers the full schema, anti-patterns, and when disabling is appropriate vs. when to fix the underlying issue.

## What's NOT checked yet (planned for v0.2+)

- **Auto-fix mode** (`--fix`) — TOC stub injection, marketplace `keywords` sorting.
- **Generic name detection** — flagging `helper`, `utils`, `tools`, `core`, `common`.
- **All-caps imperative without rationale** — heuristic detection of `ALWAYS`/`NEVER`/`MUST` not paired with "because" within 2 lines.
- **Time-sensitive language** — regex for `after [Mon] 20\d\d`, `as of v\d+\.\d+`.
- **ASCII block-drawing chars in skill content** — for the mermaid-only convention.
- **Token count** for tier-2 budget (currently uses line count as a proxy).

These are tier-3 hints; not blocking, but useful. Open a ticket / issue if you want one added.
