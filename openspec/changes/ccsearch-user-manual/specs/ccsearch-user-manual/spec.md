## ADDED Requirements

### Requirement: A user manual ships at `plugins/chat-search/MANUAL.md`

The chat-search plugin SHALL include a user-facing manual at `plugins/chat-search/MANUAL.md`. The manual MUST be plain Markdown (rendered correctly on GitHub and readable in a terminal pager). It MUST include the following top-level sections, in this order, each as an `##` heading:

1. Quick start
2. The picker
3. Picker actions (resume, dangerous resume, remote-control, tmux window, fork)
4. Mutation actions (rename, pin, help overlay)
5. One-shot mode
6. The slash command
7. The index
8. Flag reference (table)
9. Troubleshooting
10. Compatibility
11. Origins

A table of contents MUST appear at the top, linking to each `##` section.

#### Scenario: Manual exists and parses as valid Markdown

- **WHEN** a contributor runs `markdown-lint MANUAL.md` (or any standard markdown linter)
- **THEN** the file is well-formed and free of common errors (unclosed code fences, broken links to non-existent files in the repo)

#### Scenario: Every required section is present

- **WHEN** a reader scans the manual's headings
- **THEN** all 11 named `##` sections are present in the specified order

### Requirement: The manual covers every picker keybinding and CLI flag

For every keybinding accepted by the picker (those listed in the picker's BINDINGS table per the `ccsearch-picker-status-bar` capability) and every long-form CLI flag accepted by `parseArgs` (the same flags `ccsearch --help` enumerates), the manual SHALL include at least one paragraph or table row describing the user-facing behavior. The description MUST mention any preconditions (e.g., "Ctrl-W requires `$TMUX`", "Alt-Enter requires `--dangerously-skip-permissions`").

#### Scenario: A keybinding without a manual entry is a defect

- **WHEN** the picker adds a new keybinding without a corresponding manual entry
- **THEN** PR review SHOULD flag the omission (no automated test required — this is a documentation-discipline norm)

#### Scenario: Flag descriptions match `--help`

- **WHEN** a reader compares the manual's flag-reference table to `ccsearch --help`
- **THEN** the same set of long-form flags appears in both (manual MAY use shorter descriptions but the flag names match)

### Requirement: Cross-references to specs are footer-style

At the end of each major section describing a feature, the manual SHALL include a single dim/quoted line referencing the corresponding capability spec under `openspec/specs/`. Cross-references MUST use repo-relative paths (no absolute paths, no URLs).

#### Scenario: Section footer points to spec

- **WHEN** a reader finishes the "Mutation actions: rename" section
- **THEN** the section ends with a line like `> spec: openspec/specs/ccsearch-session-rename/spec.md`

#### Scenario: Sections with no corresponding spec omit the footer

- **WHEN** a section (e.g., "Quick start") has no single corresponding capability spec
- **THEN** the footer line is omitted

### Requirement: The README points to the manual

`plugins/chat-search/README.md` SHALL include a one-paragraph pointer to `MANUAL.md` within the first 30 lines of the file (i.e., visible without scrolling on a standard terminal). The paragraph MUST link to the manual using the relative path `./MANUAL.md`.

#### Scenario: README has the pointer

- **WHEN** a reader opens README.md
- **THEN** within the first 30 lines they find a paragraph mentioning MANUAL.md by name and linking to it as `./MANUAL.md`

### Requirement: Origins section credits the sibling-repo archives

The manual's "Origins" section (the final `##` section) SHALL list the four archived OpenSpec changes that shaped ccsearch's foundation. Each entry MUST give the change name and a one-line description, and MUST link to the archive path in the sibling marketplace `krmrn42/skills`.

#### Scenario: Origins lists the four foundational changes

- **WHEN** a reader scans the Origins section
- **THEN** they find entries for: `add-chat-search-plugin`, `add-chat-search-slash-command`, `chat-search-self-maintained-index`, `chat-search-zero-deps-and-resume-handoff`
- **AND** each entry includes a GitHub-style link to its `openspec/changes/archive/2026-05-10-*` path

### Requirement: Update discipline — features and docs ship together

A change-set that adds, removes, or modifies a user-visible behavior (picker keybinding, CLI flag, output format, exit code, etc.) MUST also update the corresponding section of `MANUAL.md`. This is a documentation-discipline requirement enforceable in PR review.

#### Scenario: Adding a new keybinding without manual update is a violation

- **WHEN** a contributor adds a new picker keybinding in a PR
- **AND** that PR does NOT modify the corresponding section of MANUAL.md
- **THEN** PR review SHOULD request a manual update before merge

#### Scenario: Internal refactors are exempt

- **WHEN** a change touches only internal implementation (no user-visible behavior change)
- **THEN** no manual update is required

### Requirement: In-flight feature sections are clearly marked

When the manual documents a behavior whose implementation has not yet shipped (i.e., the parallel OpenSpec change has not yet been archived to `openspec/changes/archive/`), the section MUST be prefixed with a banner reading `**🚧 Not yet implemented** (proposed in `openspec/changes/<change-name>/`)`. The banner MUST be removed only when the implementation is verified merged.

#### Scenario: Placeholder section has the banner

- **WHEN** the manual ships before the rename feature is implemented
- **THEN** the "Mutation actions: rename" section starts with the `🚧 Not yet implemented` banner

#### Scenario: Banner removed on merge

- **WHEN** the rename feature's OpenSpec change is archived
- **THEN** the implementing PR removes the banner from the rename section
- **AND** the section is verified to match the as-shipped behavior
