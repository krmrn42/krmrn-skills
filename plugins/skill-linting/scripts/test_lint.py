#!/usr/bin/env python3
"""Stdlib-only tests for plugins/skill-linting/scripts/lint.py.

Focused on cross-manifest invariants that don't fit into the existing
human-readable lint output. Add tests here when you change a rule and
want regression coverage.

Run:
    python3 plugins/skill-linting/scripts/test_lint.py

No pytest dependency by design — keeps this consistent with the
zero-deps Python posture of the lint script itself.
"""

import json
import sys
import tempfile
import unittest
from pathlib import Path

# Import the lint module from the same directory.
sys.path.insert(0, str(Path(__file__).resolve().parent))
import lint  # noqa: E402


def write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2))


def build_repo(tmp: Path, *,
               plugin_version: str,
               marketplace_version: str,
               package_version: str | None) -> Path:
    """Build a minimal monorepo fixture for the three-way version-sync check.

    The fixture mirrors the real `chat-search` ↔ `multivac` shape so the
    PLUGIN_NPM_PACKAGE_DIRS hard-coded mapping fires.
    """
    write_json(tmp / ".claude-plugin" / "marketplace.json", {
        "name": "test-mkt",
        "owner": {"name": "test"},
        "metadata": {"pluginRoot": "./plugins"},
        "plugins": [
            {
                "name": "chat-search",
                "source": "./plugins/chat-search",
                "version": marketplace_version,
                "description": "fixture",
            }
        ],
    })
    write_json(tmp / "plugins" / "chat-search" / ".claude-plugin" / "plugin.json", {
        "name": "chat-search",
        "version": plugin_version,
        "description": "fixture",
    })
    if package_version is not None:
        write_json(tmp / "packages" / "multivac" / "package.json", {
            "name": "@krmrn42/multivac",
            "version": package_version,
        })
    return tmp


class TestPackageVersionSync(unittest.TestCase):
    def _findings_for(self, **versions) -> list[lint.Finding]:
        with tempfile.TemporaryDirectory() as tmp:
            root = build_repo(Path(tmp), **versions)
            cfg = lint.Config()
            return lint.check_marketplace(root, cfg)

    def test_equal_versions_no_finding(self):
        findings = self._findings_for(
            plugin_version="0.6.0",
            marketplace_version="0.6.0",
            package_version="0.6.0",
        )
        rule_ids = {f.rule for f in findings}
        self.assertNotIn("marketplace.plugin.package-version-sync", rule_ids,
                         f"unexpected finding: {[(f.rule, f.message) for f in findings]}")
        self.assertNotIn("marketplace.plugin.version-sync", rule_ids)

    def test_package_skew_detected(self):
        findings = self._findings_for(
            plugin_version="0.6.0",
            marketplace_version="0.6.0",
            package_version="0.7.0",  # the skewed leg
        )
        triple_findings = [
            f for f in findings
            if f.rule == "marketplace.plugin.package-version-sync"
        ]
        self.assertEqual(len(triple_findings), 1,
                         f"expected exactly one finding, got {len(triple_findings)}")
        msg = triple_findings[0].message
        # Error message must name all three files and their values per task 9.2.
        self.assertIn("packages/multivac/package.json", msg)
        self.assertIn("plugin.json", msg)
        self.assertIn("marketplace.json", msg)
        self.assertIn("'0.6.0'", msg)
        self.assertIn("'0.7.0'", msg)

    def test_plugin_skew_detected(self):
        findings = self._findings_for(
            plugin_version="0.7.0",  # the skewed leg
            marketplace_version="0.6.0",
            package_version="0.6.0",
        )
        rule_ids = {f.rule for f in findings}
        # Both the legacy two-way rule AND the new three-way rule fire here —
        # the legacy rule compares plugin.json vs marketplace.json, the new
        # one compares all three. Both are real signals.
        self.assertIn("marketplace.plugin.version-sync", rule_ids)
        self.assertIn("marketplace.plugin.package-version-sync", rule_ids)

    def test_no_package_json_skips_check(self):
        # When no packages/<dir>/package.json exists (plugin has no npm
        # sibling), the three-way check is silently skipped — only the
        # legacy two-way check still applies.
        findings = self._findings_for(
            plugin_version="0.6.0",
            marketplace_version="0.6.0",
            package_version=None,
        )
        rule_ids = {f.rule for f in findings}
        self.assertNotIn("marketplace.plugin.package-version-sync", rule_ids)


if __name__ == "__main__":
    unittest.main()
