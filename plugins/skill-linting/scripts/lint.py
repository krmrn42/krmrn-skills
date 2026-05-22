#!/usr/bin/env python3
"""skill-lint — structural checks for Claude Code skills in this marketplace.

Zero dependencies beyond the Python 3.11+ standard library. Implements
tier-1 errors (block CI / pre-commit) and tier-2 warnings (surface for
review). Reads optional .skill-lint.toml at repo root for per-rule and
per-skill disables.

Philosophy: tier-1 errors enforce Anthropic's documented spec. Tier-2
warnings surface deviation from Anthropic's *modeled* practice — patterns
their own skills follow but the spec doesn't strictly require. Warnings
are visible-but-non-blocking by design.

Usage:
    python3 plugins/skill-linting/scripts/lint.py [PATH ...]
    python3 plugins/skill-linting/scripts/lint.py --strict
    python3 plugins/skill-linting/scripts/lint.py --format github
    python3 plugins/skill-linting/scripts/lint.py --severity error

Exit codes:
    0 — no findings (or only info, or warnings without --strict)
    1 — tier-1 errors found, or warnings with --strict
    2 — fatal (cannot find repo root, manifest unparseable, etc.)
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

try:
    import tomllib  # Python 3.11+
except ImportError:
    tomllib = None


# ---- Rule limits (mirror skill-authoring/structural-rules.md) ----

NAME_MAX = 64
NAME_PATTERN = re.compile(r"^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$")
NAME_RESERVED = {"anthropic", "claude"}

DESCRIPTION_MAX = 1024
COMBINED_HARD_CAP = 1536    # documented Claude Code listing-truncation cap (spec)
COMBINED_MARGIN = 1100      # our prudent target — leaves headroom under context-budget pressure

BODY_MAX_LINES = 500
REFERENCE_TOC_THRESHOLD = 100

XML_TAG_RE = re.compile(r"<[a-zA-Z][a-zA-Z0-9-]*[\s/>]")
LINK_RE = re.compile(r"\[([^\]]+)\]\(([^)]+\.md)\)")

# Heuristic: descriptions starting with these tokens are likely 1st/2nd person.
NON_THIRD_PERSON_PREFIX = re.compile(
    r"^(I |I'|You |You'|We |Let me |Helps you |This skill |A skill )",
    re.IGNORECASE,
)

EXCLUSION_PATTERNS = [
    re.compile(r"\bNot for\b", re.IGNORECASE),
    re.compile(r"\bDo not use for\b", re.IGNORECASE),
    re.compile(r"\bDoes not (?:trigger|fire) on\b", re.IGNORECASE),
    re.compile(r"\bDoes NOT trigger\b"),
]

# Plugins that also ship an npm package under packages/<dir>/.
# When present, package.json#version must match plugin.json#version and the
# marketplace entry's version — the three are released in lockstep. Add an
# entry here if a new plugin grows an npm sibling.
PLUGIN_NPM_PACKAGE_DIRS: dict[str, str] = {
    "chat-search": "multivac",
}


# ---- Documentation URLs per rule ----
# Each rule that has a canonical published source maps to its URL.
# Rules without an external source (internal-only conventions) are absent;
# reporters will simply not show a docs line.

ANTHROPIC_BEST_PRACTICES = (
    "https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices"
)
CLAUDE_CODE_SKILLS = "https://code.claude.com/docs/en/skills"
CLAUDE_CODE_PLUGINS = "https://code.claude.com/docs/en/plugins"
AGENT_SKILLS_SPEC = "https://agentskills.io/specification"

DOCS: dict[str, str] = {
    # Frontmatter — content/structure rules
    "frontmatter.missing": ANTHROPIC_BEST_PRACTICES,
    "frontmatter.name.missing": ANTHROPIC_BEST_PRACTICES,
    "frontmatter.name.length": ANTHROPIC_BEST_PRACTICES,
    "frontmatter.name.format": ANTHROPIC_BEST_PRACTICES,
    "frontmatter.name.reserved": ANTHROPIC_BEST_PRACTICES,
    "frontmatter.name.consecutive-hyphens": AGENT_SKILLS_SPEC,
    "frontmatter.name.parent-dir-mismatch": AGENT_SKILLS_SPEC,
    "frontmatter.description.missing": ANTHROPIC_BEST_PRACTICES,
    "frontmatter.description.length": ANTHROPIC_BEST_PRACTICES,
    "frontmatter.description.xml": ANTHROPIC_BEST_PRACTICES,
    "frontmatter.description.third-person": ANTHROPIC_BEST_PRACTICES,
    # Combined cap — Claude Code-specific behavior
    "frontmatter.combined.length": CLAUDE_CODE_SKILLS,
    "frontmatter.combined.margin": CLAUDE_CODE_SKILLS,
    # Body & references — best-practices
    "body.length": ANTHROPIC_BEST_PRACTICES,
    "reference.toc.missing": ANTHROPIC_BEST_PRACTICES,
    "reference.depth": ANTHROPIC_BEST_PRACTICES,
    # Manifest rules — Claude Code plugins page
    "plugin.manifest.missing": CLAUDE_CODE_PLUGINS,
    "plugin.manifest.parse": CLAUDE_CODE_PLUGINS,
    "plugin.manifest.name.missing": CLAUDE_CODE_PLUGINS,
    "plugin.manifest.name.dir-mismatch": CLAUDE_CODE_PLUGINS,
    "plugin.manifest.version.missing": CLAUDE_CODE_PLUGINS,
    "marketplace.missing": CLAUDE_CODE_PLUGINS,
    "marketplace.parse": CLAUDE_CODE_PLUGINS,
    "plugins.dir.missing": CLAUDE_CODE_PLUGINS,
    "marketplace.plugin.unregistered": CLAUDE_CODE_PLUGINS,
    "marketplace.plugin.dangling": CLAUDE_CODE_PLUGINS,
    "marketplace.plugin.source": CLAUDE_CODE_PLUGINS,
    "marketplace.plugin.version-sync": CLAUDE_CODE_PLUGINS,
    "marketplace.plugin.package-version-sync": CLAUDE_CODE_PLUGINS,
    # No URL: frontmatter.description.exclusion-clause (community pattern,
    # documented in this repo's skill-authoring), reference.orphan
    # (mechanical cousin of progressive-disclosure), io.read (fatal).
}


# ---- Data structures ----

@dataclass
class Finding:
    file: str
    line: Optional[int]
    severity: str  # "error" | "warning" | "info"
    rule: str
    message: str
    fix: Optional[str] = None
    docs: Optional[str] = field(init=False, default=None)

    def __post_init__(self) -> None:
        self.docs = DOCS.get(self.rule)


@dataclass
class Config:
    """Loaded from .skill-lint.toml at repo root (optional).

    Three tiers of suppression:
      1. `[disable] checks = [...]` — repo-wide rule disables (broadest).
      2. `[per_skill."<path>"] disable = [...]` — skill-or-plugin-scoped.
      3. `[[allow."<rule.id>"]]` with file/target/reason — per-instance
         allowlist for rules that fire multiple times within one file.
         Today only `reference.depth` is instance-based; future heuristic
         rules can opt in by checking `is_allowed()` before emitting.
    """
    disabled_global: set[str] = field(default_factory=set)
    disabled_per_skill: dict[str, set[str]] = field(default_factory=dict)
    # rule_id -> list of {file, target, reason} dicts
    allowed: dict[str, list[dict[str, str]]] = field(default_factory=dict)

    @classmethod
    def load(cls, path: Path) -> "Config":
        cfg = cls()
        if not path.exists() or tomllib is None:
            return cfg
        with open(path, "rb") as f:
            data = tomllib.load(f)
        cfg.disabled_global = set(data.get("disable", {}).get("checks", []))
        for skill_path, val in data.get("per_skill", {}).items():
            cfg.disabled_per_skill[skill_path] = set(val.get("disable", []))
        # Per-instance allowlist. Each rule_id maps to a list of entries.
        for rule_id, entries in data.get("allow", {}).items():
            if isinstance(entries, list):
                cfg.allowed[rule_id] = [
                    {k: str(v) for k, v in e.items()}
                    for e in entries
                    if isinstance(e, dict)
                ]
        return cfg

    def is_disabled(self, rule: str, skill_rel: Optional[str] = None) -> bool:
        if rule in self.disabled_global:
            return True
        if skill_rel and rule in self.disabled_per_skill.get(skill_rel, set()):
            return True
        return False

    def is_allowed(self, rule: str, file: str, target: str) -> bool:
        """Check if a (file, target) pair is on the per-instance allowlist
        for the given rule. Path comparison normalizes a leading `./`."""
        def norm(p: str) -> str:
            return p.lstrip("./") if p.startswith("./") else p
        file_n = norm(file)
        for entry in self.allowed.get(rule, []):
            if (
                norm(entry.get("file", "")) == file_n
                and entry.get("target") == target
            ):
                return True
        return False


# ---- Frontmatter parsing ----

def parse_frontmatter(content: str) -> tuple[Optional[dict], int]:
    """Parse the YAML frontmatter block. Returns (fields, body_offset).

    Handles only the YAML subset our skills use: top-level key:value pairs
    where the value is on the same line (or trivially continued on the next
    line via implicit indentation). No nested structures, no anchors.
    """
    if not content.startswith("---\n"):
        return None, 0
    m = re.search(r"\n---\n", content[4:])
    if not m:
        return None, 0
    fm_text = content[4:4 + m.start()]
    body_start = 4 + m.end()

    fields: dict[str, str] = {}
    current_key: Optional[str] = None
    current_value: list[str] = []

    for line in fm_text.split("\n"):
        kv = re.match(r"^([a-z][a-z0-9_-]*):\s*(.*)$", line)
        if kv and not line.startswith((" ", "\t")):
            if current_key is not None:
                fields[current_key] = "\n".join(current_value).strip()
            current_key = kv.group(1)
            initial = kv.group(2)
            current_value = [initial] if initial else []
        elif current_key is not None:
            current_value.append(line)

    if current_key is not None:
        fields[current_key] = "\n".join(current_value).strip()
    return fields, body_start


# ---- Per-skill checks ----

def check_skill_md(skill_md: Path, repo_root: Path, cfg: Config) -> list[Finding]:
    findings: list[Finding] = []
    skill_rel = str(skill_md.parent.relative_to(repo_root))
    file_rel = str(skill_md.relative_to(repo_root))

    def emit(severity: str, rule: str, message: str,
             line: Optional[int] = None, fix: Optional[str] = None) -> None:
        if cfg.is_disabled(rule, skill_rel):
            return
        findings.append(Finding(file_rel, line, severity, rule, message, fix))

    try:
        content = skill_md.read_text(encoding="utf-8")
    except OSError as e:
        emit("error", "io.read",
             f"cannot read SKILL.md: {e}",
             fix="check the path and file permissions")
        return findings

    fields, body_start = parse_frontmatter(content)
    if fields is None:
        emit("error", "frontmatter.missing",
             "SKILL.md must open with `---`-delimited YAML frontmatter "
             "containing at least `name` and `description`. Without it Claude "
             "cannot load the skill.",
             fix="add a frontmatter block at the top of the file")
        return findings

    name = fields.get("name", "")
    description = fields.get("description", "")
    when_to_use = fields.get("when_to_use", "")

    # ---- name ----
    if not name:
        emit("error", "frontmatter.name.missing",
             "frontmatter `name` field is missing or empty; Claude Code uses "
             "it to install and invoke the skill",
             fix="add `name: <slug>` to the frontmatter, matching the parent "
                 "directory name")
    else:
        if len(name) > NAME_MAX:
            emit("error", "frontmatter.name.length",
                 f"`name` is {len(name)} chars; the spec caps it at "
                 f"{NAME_MAX}",
                 fix="shorten the name (drop generic suffixes like "
                     "'-helper', '-tool', '-skill')")
        if "--" in name:
            emit("error", "frontmatter.name.consecutive-hyphens",
                 f"`name` {name!r} contains consecutive hyphens (`--`); "
                 f"the open spec disallows them",
                 fix="use single hyphens between words "
                     "(e.g., `multi-step-flow` not `multi--step-flow`)")
        elif not NAME_PATTERN.match(name):
            emit("error", "frontmatter.name.format",
                 f"`name` {name!r} must contain only lowercase letters, "
                 f"digits, and hyphens; cannot start or end with a hyphen",
                 fix="rename to all-lowercase with hyphen separators "
                     "(e.g., `my-skill-name`)")
        if name.lower() in NAME_RESERVED:
            emit("error", "frontmatter.name.reserved",
                 f"`name` is a reserved word {name!r}; Anthropic forbids "
                 f"{sorted(NAME_RESERVED)} in skill names",
                 fix="pick a non-reserved name describing what the skill does")
        skill_dir_name = skill_md.parent.name
        if name != skill_dir_name:
            emit("error", "frontmatter.name.parent-dir-mismatch",
                 f"`name` is {name!r} but the parent directory is "
                 f"{skill_dir_name!r}; the spec requires them to match — "
                 f"Claude Code uses both for skill resolution",
                 fix=f"rename either the directory or the `name` field so "
                     f"both equal the same string")

    # ---- description ----
    if not description:
        emit("error", "frontmatter.description.missing",
             "frontmatter `description` field is missing or empty; without it "
             "Claude has no signal to invoke the skill from the candidate pool",
             fix="add a description naming what the skill does and concrete "
                 "user phrasings that should trigger it")
    else:
        if len(description) > DESCRIPTION_MAX:
            emit("error", "frontmatter.description.length",
                 f"`description` is {len(description)} chars; the spec caps "
                 f"it at {DESCRIPTION_MAX}. Over-cap descriptions are "
                 f"non-spec and may be rejected by future tooling.",
                 fix=f"trim by {len(description) - DESCRIPTION_MAX} chars; "
                     f"drop redundant phrasings or factor methodology detail "
                     f"into the body")
        if XML_TAG_RE.search(description):
            emit("error", "frontmatter.description.xml",
                 "`description` contains XML/HTML tags (e.g., `<system>`); "
                 "the spec forbids this because the description is injected "
                 "into Claude's system prompt and stray tags can break parsing",
                 fix="replace `<placeholder>` with `{placeholder}`, "
                     "`[placeholder]`, or quoted prose")
        if name:
            # Per Claude Code docs: the listing entry shows name +
            # description + when_to_use; the per-entry cap is on the
            # combined text. Sum all three for the truthful check.
            combined = len(name) + len(description) + len(when_to_use)
            wtu_note = (
                f" (description: {len(description)}, when_to_use: "
                f"{len(when_to_use)})" if when_to_use else ""
            )
            if combined > COMBINED_HARD_CAP:
                emit("error", "frontmatter.combined.length",
                     f"combined `name` + `description`"
                     f"{' + `when_to_use`' if when_to_use else ''} is "
                     f"{combined} chars{wtu_note}; Claude Code's documented "
                     f"per-listing cap is {COMBINED_HARD_CAP}. Above the cap "
                     f"the listing entry is truncated mid-sentence — the "
                     f"exclusion clause (often the tail) gets sliced off.",
                     fix=f"trim by {combined - COMBINED_HARD_CAP} chars to "
                         f"fit the hard cap; usually shorten the description "
                         f"or when_to_use")
            elif combined > COMBINED_MARGIN:
                emit("warning", "frontmatter.combined.margin",
                     f"combined `name` + `description`"
                     f"{' + `when_to_use`' if when_to_use else ''} is "
                     f"{combined} chars{wtu_note} (target {COMBINED_MARGIN}, "
                     f"hard cap {COMBINED_HARD_CAP}). The actual budget is "
                     f"dynamic ('1% of context window, fallback 8,000 chars' "
                     f"shared across all loaded skills), so listing entries "
                     f"can truncate well before the hard cap under pressure. "
                     f"Anthropic's own skills sit well below the target.",
                     fix=f"trim by {combined - COMBINED_MARGIN} chars to "
                         f"reach the safe target")
        if NON_THIRD_PERSON_PREFIX.match(description):
            head = " ".join(description.split()[:3])
            emit("warning", "frontmatter.description.third-person",
                 f"description appears to start in 1st/2nd person "
                 f"({head!r}); the spec requires third-person verb form. "
                 f"The description is injected into Claude's system prompt "
                 f"and inconsistent point-of-view causes discovery problems.",
                 fix="rewrite as third-person ('Authors and reviews…', "
                     "'Processes…', 'Generates…') instead of 'I help…' or "
                     "'You can…'")
        if not any(p.search(description) for p in EXCLUSION_PATTERNS):
            emit("warning", "frontmatter.description.exclusion-clause",
                 "description has no exclusion clause; without naming what "
                 "NOT to trigger on, the skill tends to over-fire on adjacent "
                 "tasks (a 'review' skill firing on every 'review' mention)",
                 fix="end the description with `Not for X, Y, or Z.` naming "
                     "3-5 plausible near-miss phrasings")

    # ---- body length ----
    body = content[body_start:]
    body_lines = body.count("\n")
    if body_lines > BODY_MAX_LINES:
        emit("error", "body.length",
             f"SKILL.md body is {body_lines} lines; Anthropic best-practices "
             f"recommends ≤{BODY_MAX_LINES} for the tier-2 budget. Beyond "
             f"this, compaction recovery degrades — only the first 5K tokens "
             f"re-attach after a context summary.",
             fix="factor topics into references/; don't compress prose — "
                 "split related material into separate references that "
                 "SKILL.md links directly")

    return findings


# ---- Reference checks ----

def check_references(skill_dir: Path, repo_root: Path, cfg: Config) -> list[Finding]:
    findings: list[Finding] = []
    skill_rel = str(skill_dir.relative_to(repo_root))
    refs_dir = skill_dir / "references"
    if not refs_dir.is_dir():
        return findings

    skill_md = skill_dir / "SKILL.md"
    skill_content = skill_md.read_text(encoding="utf-8") if skill_md.exists() else ""

    plugin_root = skill_dir.parent.parent  # plugins/<plugin>/
    plugin_readme = plugin_root / "README.md"
    plugin_readme_text = (
        plugin_readme.read_text(encoding="utf-8") if plugin_readme.exists() else ""
    )

    linked_from_skill: set[str] = {
        os.path.basename(m.group(2))
        for m in LINK_RE.finditer(skill_content)
        if "references/" in m.group(2)
    }

    for ref_file in sorted(refs_dir.glob("*.md")):
        file_rel = str(ref_file.relative_to(repo_root))

        def emit(severity: str, rule: str, message: str,
                 line: Optional[int] = None, fix: Optional[str] = None,
                 file_override: Optional[str] = None) -> None:
            if cfg.is_disabled(rule, skill_rel):
                return
            findings.append(
                Finding(file_override or file_rel, line, severity, rule, message, fix)
            )

        try:
            content = ref_file.read_text(encoding="utf-8")
        except OSError as e:
            emit("error", "io.read",
                 f"cannot read reference: {e}",
                 fix="check the path and file permissions")
            continue
        lines = content.split("\n")

        # TOC threshold
        if len(lines) > REFERENCE_TOC_THRESHOLD:
            head = "\n".join(lines[:30]).lower()
            if "## contents" not in head and "## table of contents" not in head:
                emit("warning", "reference.toc.missing",
                     f"reference is {len(lines)} lines (over the "
                     f"{REFERENCE_TOC_THRESHOLD}-line threshold) and lacks "
                     f"a `## Contents` heading in the first 30 lines. Without "
                     f"a TOC, Claude's partial reads (`head -100`) miss "
                     f"sections beyond line 100.",
                     fix="add `## Contents` near the top with bullet links "
                         "to each H2 heading")

        # Ref-depth — links to sibling reference files. Anthropic's docs forbid
        # content chains (depth-2 content); their own skills avoid sibling
        # cross-references entirely, preferring hub-and-spoke from SKILL.md.
        # We warn so the deviation is visible; restructure or disable in
        # .skill-lint.toml are the dispositions.
        for line_no, line in enumerate(lines, 1):
            for m in LINK_RE.finditer(line):
                target = m.group(2)
                if target.startswith(("http://", "https://", "#")):
                    continue
                if "/" not in target and target.endswith(".md"):
                    sibling = refs_dir / target
                    if sibling.exists() and sibling.resolve() != ref_file.resolve():
                        # Per-instance allowlist (tier 3): if the
                        # (file, target) pair is explicitly allowed in
                        # .skill-lint.toml, skip without emitting.
                        if cfg.is_allowed("reference.depth", file_rel, target):
                            continue
                        emit("warning", "reference.depth",
                             f"links to sibling reference {target!r}. "
                             f"Anthropic's published example skills (pdf, xlsx, "
                             f"docx, pptx, mcp-builder, webapp-testing, "
                             f"skill-creator) contain zero markdown cross-links "
                             f"between sibling references — they follow strict "
                             f"hub-and-spoke from SKILL.md. The literal docs "
                             f"only forbid content chains (depth-2 content), "
                             f"but the modeled practice goes further.",
                             line=line_no,
                             fix="restructure: inline the linked content into "
                                 "this file, or have SKILL.md link both files "
                                 "directly so neither needs to point at the "
                                 "other. If the cross-reference is genuinely "
                                 "the right design, disable in `.skill-lint.toml` "
                                 "with a `reason`")

        # Orphan check — reference must be discoverable from SKILL.md or plugin README
        if (
            ref_file.name not in linked_from_skill
            and ref_file.name not in plugin_readme_text
        ):
            emit("warning", "reference.orphan",
                 f"reference `{ref_file.name}` is not linked from `SKILL.md` "
                 f"or the plugin `README.md`; progressive disclosure cannot "
                 f"reach it — orphan references never load",
                 fix="add a link from `SKILL.md` (preferred) in the "
                     "'Reference & template files' section, or remove the file "
                     "if it's no longer needed")

    return findings


# ---- Per-plugin manifest checks ----

def check_plugin_manifest(plugin_dir: Path, repo_root: Path, cfg: Config) -> list[Finding]:
    findings: list[Finding] = []
    plugin_rel = str(plugin_dir.relative_to(repo_root))
    manifest = plugin_dir / ".claude-plugin" / "plugin.json"
    file_rel = str(manifest.relative_to(repo_root))

    def emit(severity: str, rule: str, message: str,
             line: Optional[int] = None, fix: Optional[str] = None) -> None:
        if cfg.is_disabled(rule, plugin_rel):
            return
        findings.append(Finding(file_rel, line, severity, rule, message, fix))

    if not manifest.exists():
        emit("error", "plugin.manifest.missing",
             "plugin directory has no `.claude-plugin/plugin.json`; "
             "the loader requires this file to recognize the plugin",
             fix="create `.claude-plugin/plugin.json` with `name`, `version`, "
                 "`description`, and `author`. See "
                 "`plugins/authoring/skills/skill-authoring/templates/"
                 "plugin-manifest.md` for a template.")
        return findings

    try:
        data = json.loads(manifest.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        emit("error", "plugin.manifest.parse",
             f"plugin.json is invalid JSON: {e}",
             fix="validate with `python3 -m json.tool plugin.json`. Common "
                 "causes: trailing commas, unescaped quotes, missing braces.")
        return findings

    name = data.get("name", "")
    if not name:
        emit("error", "plugin.manifest.name.missing",
             "plugin.json is missing the required `name` field",
             fix=f'add `"name": "{plugin_dir.name}"` (matching the plugin '
                 "directory name)")
    elif name != plugin_dir.name:
        emit("error", "plugin.manifest.name.dir-mismatch",
             f"plugin.json `name` is {name!r} but the plugin directory is "
             f"{plugin_dir.name!r}; drift between the two breaks "
             f"`/plugin install` (the marketplace `source` path uses the "
             f"directory name; `name` is what users invoke)",
             fix="rename either the directory or the `name` field so they "
                 "agree")

    if not data.get("version"):
        emit("error", "plugin.manifest.version.missing",
             "plugin.json is missing `version`; without it the commit SHA "
             "becomes the version and every commit appears as a new release",
             fix='add `"version": "0.1.0"` (or your current semver)')

    return findings


# ---- Repo-level checks (cross-manifest) ----

def check_marketplace(repo_root: Path, cfg: Config) -> list[Finding]:
    findings: list[Finding] = []
    market = repo_root / ".claude-plugin" / "marketplace.json"
    file_rel = str(market.relative_to(repo_root))

    def emit(severity: str, rule: str, message: str,
             line: Optional[int] = None, fix: Optional[str] = None) -> None:
        if cfg.is_disabled(rule):
            return
        findings.append(Finding(file_rel, line, severity, rule, message, fix))

    if not market.exists():
        emit("error", "marketplace.missing",
             "no `.claude-plugin/marketplace.json` at repo root; this is "
             "the marketplace's entry point — Claude reads it first",
             fix="create `.claude-plugin/marketplace.json` with `name`, "
                 "`description`, `owner`, `metadata.pluginRoot`, and "
                 "`plugins[]`")
        return findings

    try:
        data = json.loads(market.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        emit("error", "marketplace.parse",
             f"marketplace.json is invalid JSON: {e}",
             fix="validate with `python3 -m json.tool .claude-plugin/"
                 "marketplace.json`")
        return findings

    market_entries: dict[str, dict] = {
        entry["name"]: entry for entry in data.get("plugins", []) if "name" in entry
    }

    plugins_dir = repo_root / "plugins"
    if not plugins_dir.is_dir():
        emit("error", "plugins.dir.missing",
             "no `plugins/` directory at repo root; `marketplace.json` "
             "`metadata.pluginRoot` defaults to `./plugins`, so this is "
             "where plugins must live",
             fix="create `plugins/` and move plugin directories under it, "
                 "or update `metadata.pluginRoot` in marketplace.json to "
                 "point at the actual location")
        return findings

    fs_plugins = {
        p.name for p in plugins_dir.iterdir()
        if p.is_dir() and (p / ".claude-plugin").is_dir()
    }

    # Plugin-on-disk without a marketplace entry
    for name in sorted(fs_plugins):
        if name not in market_entries:
            emit("error", "marketplace.plugin.unregistered",
                 f"plugin `plugins/{name}/` exists on disk but has no entry "
                 f"in marketplace.json — users cannot `/plugin install` it",
                 fix=f"add an entry to `plugins[]` in marketplace.json with "
                     f"`name: \"{name}\"`, `source: \"./plugins/{name}\"`, "
                     f"`version` (matching plugin.json), and `description`. "
                     f"See `plugins/authoring/skills/skill-authoring/templates/"
                     f"plugin-manifest.md`.")

    # Marketplace entry without a plugin on disk
    for name, entry in market_entries.items():
        if name not in fs_plugins:
            emit("error", "marketplace.plugin.dangling",
                 f"marketplace.json registers plugin {name!r} but "
                 f"`plugins/{name}/` does not exist on disk; "
                 f"`/plugin install` will fail with a confusing error",
                 fix="either remove the entry from marketplace.json, or "
                     "create the plugin directory and its `.claude-plugin/"
                     "plugin.json`")
            continue

        # source path
        expected_source = f"./plugins/{name}"
        if entry.get("source") != expected_source:
            emit("error", "marketplace.plugin.source",
                 f"plugin {name!r} marketplace `source` is "
                 f"{entry.get('source')!r}, expected {expected_source!r}; "
                 f"the loader resolves source paths relative to repo root "
                 f"using `metadata.pluginRoot`",
                 fix=f'set `"source": "{expected_source}"` in the marketplace '
                     "entry")

        # version sync with plugin.json
        plugin_json = plugins_dir / name / ".claude-plugin" / "plugin.json"
        if plugin_json.exists():
            try:
                pj = json.loads(plugin_json.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                continue  # already reported by check_plugin_manifest
            if pj.get("version") != entry.get("version"):
                emit("error", "marketplace.plugin.version-sync",
                     f"version drift for {name!r}: "
                     f"plugin.json={pj.get('version')!r} vs "
                     f"marketplace.json={entry.get('version')!r}. "
                     f"Installations resolve one or the other inconsistently "
                     f"— drift is silent breakage.",
                     fix="bump both files to the same version in one commit. "
                         "Decide which value is canonical (usually the "
                         "plugin.json one) and align the other.")

        # Three-way version-sync for plugins that also ship an npm package:
        # packages/<dir>/package.json#version must match plugin.json#version
        # AND marketplace.json#version. The triple is released in lockstep
        # (one tag, one CI run) so any skew is a release-blocking error.
        package_dir = PLUGIN_NPM_PACKAGE_DIRS.get(name)
        if package_dir:
            pkg_json_path = repo_root / "packages" / package_dir / "package.json"
            if pkg_json_path.exists():
                try:
                    pkg = json.loads(pkg_json_path.read_text(encoding="utf-8"))
                except json.JSONDecodeError as e:
                    emit("error", "marketplace.plugin.package-version-sync",
                         f"packages/{package_dir}/package.json is invalid "
                         f"JSON: {e}; cannot verify version-sync with "
                         f"plugin.json and marketplace.json.",
                         fix="validate with `python3 -m json.tool "
                             f"packages/{package_dir}/package.json`.")
                else:
                    versions = {
                        "packages/" + package_dir + "/package.json":
                            pkg.get("version"),
                        "plugins/" + name + "/.claude-plugin/plugin.json":
                            pj.get("version") if plugin_json.exists() else None,
                        ".claude-plugin/marketplace.json#" + name:
                            entry.get("version"),
                    }
                    distinct = set(versions.values())
                    if len(distinct) > 1:
                        triple_str = ", ".join(
                            f"{p}={v!r}" for p, v in versions.items()
                        )
                        emit("error",
                             "marketplace.plugin.package-version-sync",
                             f"version drift across the {name!r} release "
                             f"triple: {triple_str}. The plugin and its npm "
                             f"package are released in lockstep — any skew "
                             f"is a release-blocking error.",
                             fix=f"bump all three files to the same version "
                                 f"in one commit; the GitHub Actions publish "
                                 f"workflow keys off the tag `multivac-v<ver>` "
                                 f"and will refuse to ship on mismatch.")

    return findings


# ---- Discovery ----

def discover_skills(root: Path) -> list[Path]:
    return sorted(root.glob("plugins/*/skills/*/SKILL.md"))


def discover_plugins(root: Path) -> list[Path]:
    plugins_dir = root / "plugins"
    if not plugins_dir.is_dir():
        return []
    return sorted(
        p for p in plugins_dir.iterdir()
        if p.is_dir() and (p / ".claude-plugin").is_dir()
    )


def find_repo_root(start: Path) -> Optional[Path]:
    cur = start.resolve()
    while True:
        if (cur / ".claude-plugin" / "marketplace.json").exists():
            return cur
        if cur.parent == cur:
            return None
        cur = cur.parent


# ---- Reporters ----

def report_human(findings: list[Finding], use_color: bool) -> str:
    if not findings:
        return ""
    GREEN = "\033[32m" if use_color else ""
    YELLOW = "\033[33m" if use_color else ""
    RED = "\033[31m" if use_color else ""
    BOLD = "\033[1m" if use_color else ""
    DIM = "\033[2m" if use_color else ""
    RESET = "\033[0m" if use_color else ""
    SEV_COLOR = {"error": RED, "warning": YELLOW, "info": DIM}

    lines: list[str] = []
    by_file: dict[str, list[Finding]] = {}
    for f in findings:
        by_file.setdefault(f.file, []).append(f)

    for file_path, fs in sorted(by_file.items()):
        lines.append(f"{BOLD}{file_path}{RESET}")
        for f in fs:
            loc = f":{f.line}" if f.line else ""
            color = SEV_COLOR.get(f.severity, "")
            lines.append(
                f"  {color}{f.severity.upper()}{RESET} "
                f"[{f.rule}]{loc}  {f.message}"
            )
            if f.fix:
                lines.append(f"      {DIM}fix:  {f.fix}{RESET}")
            if f.docs:
                lines.append(f"      {DIM}docs: {f.docs}{RESET}")
    return "\n".join(lines)


def report_github(findings: list[Finding]) -> str:
    out: list[str] = []
    for f in findings:
        loc = f",line={f.line}" if f.line else ""
        # GitHub Actions only knows error/warning/notice
        sev = "notice" if f.severity == "info" else f.severity
        # Compose message with fix and docs inline since GHA annotations
        # only have one message field.
        parts = [f.message]
        if f.fix:
            parts.append(f"Fix: {f.fix}")
        if f.docs:
            parts.append(f"Docs: {f.docs}")
        msg = " | ".join(parts)
        msg = msg.replace("\n", " ").replace("%", "%25").replace("\r", "%0D")
        out.append(f"::{sev} file={f.file}{loc},title={f.rule}::{msg}")
    return "\n".join(out)


def report_json(findings: list[Finding]) -> str:
    return json.dumps([
        {
            "file": f.file,
            "line": f.line,
            "severity": f.severity,
            "rule": f.rule,
            "message": f.message,
            "fix": f.fix,
            "docs": f.docs,
        }
        for f in findings
    ], indent=2)


# ---- Main ----

def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        prog="skill-lint",
        description="Lint Claude Code skills for structural correctness.",
    )
    parser.add_argument("paths", nargs="*",
                        help="specific skill or plugin paths (default: all)")
    parser.add_argument("--strict", action="store_true",
                        help="treat warnings as errors (exit 1 on any finding)")
    parser.add_argument("--format", default="human",
                        choices=["human", "github", "json"])
    parser.add_argument("--severity", default="warning",
                        choices=["error", "warning", "info"],
                        help="minimum severity reported (default: warning)")
    parser.add_argument("--no-color", action="store_true")
    parser.add_argument("--repo-root", default=None,
                        help="repo root (default: ascend until marketplace.json found)")
    args = parser.parse_args(argv)

    repo_root = (
        Path(args.repo_root).resolve() if args.repo_root
        else find_repo_root(Path.cwd())
    )
    if repo_root is None:
        print(
            "error: cannot find repo root "
            "(no .claude-plugin/marketplace.json in any ancestor)",
            file=sys.stderr,
        )
        return 2

    cfg = Config.load(repo_root / ".skill-lint.toml")

    skills: list[Path]
    plugins: list[Path]
    check_market: bool
    if args.paths:
        skills, plugins = [], []
        for p in args.paths:
            pp = Path(p).resolve()
            if (pp / "SKILL.md").exists():
                skills.append(pp / "SKILL.md")
            elif (pp / ".claude-plugin").is_dir():
                plugins.append(pp)
                skills.extend(sorted(pp.glob("skills/*/SKILL.md")))
            elif pp.name == "SKILL.md" and pp.is_file():
                skills.append(pp)
            else:
                print(f"warning: skipping unrecognized path {p!r}", file=sys.stderr)
        check_market = False
    else:
        skills = discover_skills(repo_root)
        plugins = discover_plugins(repo_root)
        check_market = True

    findings: list[Finding] = []
    for s in skills:
        findings.extend(check_skill_md(s, repo_root, cfg))
        findings.extend(check_references(s.parent, repo_root, cfg))
    for p in plugins:
        findings.extend(check_plugin_manifest(p, repo_root, cfg))
    if check_market:
        findings.extend(check_marketplace(repo_root, cfg))

    sev_order = {"info": 0, "warning": 1, "error": 2}
    findings = [f for f in findings if sev_order[f.severity] >= sev_order[args.severity]]

    if args.format == "human":
        out = report_human(
            findings,
            use_color=not args.no_color and sys.stdout.isatty(),
        )
    elif args.format == "github":
        out = report_github(findings)
    else:
        out = report_json(findings)

    if out:
        print(out)

    has_error = any(f.severity == "error" for f in findings)
    has_warn = any(f.severity == "warning" for f in findings)
    if has_error or (args.strict and has_warn):
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
