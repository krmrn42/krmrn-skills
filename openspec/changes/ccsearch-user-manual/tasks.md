## 1. Scaffold the manual

- [ ] 1.1 Create `plugins/chat-search/MANUAL.md` with the 11-section skeleton plus a TOC at the top.
- [ ] 1.2 Fill in **Quick start**: install (one block), first invocation (one block), one-screen description of what the picker shows.

## 2. Write the picker section

- [ ] 2.1 **The picker**: structure (prompt line / status bar / result list / optional preview pane), how it opens (default-on-TTY behavior from `ccsearch-default-mode`), what the empty-query view shows (recent-browse from `ccsearch-recent-browse`), FTS5 syntax brief, terminal-size requirements.
- [ ] 2.2 **Picker actions**: subsection per action.
  - Resume (plain Enter) — argv shape, cwd resolution, exit code propagation.
  - Dangerous resume (Alt-Enter / Shift-Enter, requires `--dangerously-skip-permissions`) — what's skipped, two-layer opt-in rationale, terminal-compatibility note.
  - Remote-control (Ctrl-T) — when to reach for it, name-passthrough behavior. 🚧 BANNER until `picker-remote-control-launch` ships.
  - Tmux new-window (Ctrl-W, requires `$TMUX`) — window naming rules, focus behavior, `--no-tmux` escape hatch. 🚧 BANNER until `picker-tmux-new-window` ships.
  - Fork (Ctrl-F) — new session id semantics.
- [ ] 2.3 **Mutation actions**:
  - Rename (Ctrl-R) — inline-input mode, persistence, name passthrough to claude. 🚧 BANNER until `picker-rename-session` ships.
  - Pin (Ctrl-P) — pinned ordering rules, divider, indicator. 🚧 BANNER until `picker-pin-sessions` ships.
  - Help overlay (`?`) — 🚧 BANNER until `picker-status-bar` ships.

## 3. Write the non-picker sections

- [ ] 3.1 **One-shot mode**: when it engages (`--list`, `--format=*`, `--regex`, piped output, special modes), text vs tsv, example pipelines.
- [ ] 3.2 **The slash command**: `/chat-search:find`, fixed flag set (`--format=text --no-color --limit=10`), inline-rendered output shape, how to resume from inside a Claude session.
- [ ] 3.3 **The index**: where it lives, when it builds, incremental refresh, `--reindex`, `--index-status`, read-only invariant against `~/.claude/projects/`.
- [ ] 3.4 **Flag reference**: compressed table of every long-form flag. One short description per row, no defaults (refer to `--help` for canonical).
- [ ] 3.5 **Troubleshooting**: common errors keyed on exit code (1, 2, 3) with their typical causes and remedies.
- [ ] 3.6 **Compatibility**: Node 22.5+, terminals where Shift+Enter works (CSI-u list), tmux quirks (nested, screen-inside-tmux), Windows status (untested).

## 4. Cross-reference footers

- [ ] 4.1 At the end of each feature subsection, add a dim/quoted line: `> spec: openspec/specs/ccsearch-<capability>/spec.md`. One footer per section; sections without a corresponding spec omit the footer.

## 5. README pointer

- [ ] 5.1 Update `plugins/chat-search/README.md` with a one-paragraph pointer to MANUAL.md within the first 30 lines.

## 6. Origins section

- [ ] 6.1 At the end of MANUAL.md, add an **Origins** section listing the four foundational changes from `krmrn42/skills`:
  - `add-chat-search-plugin` — the plugin scaffold.
  - `add-chat-search-slash-command` — the `/chat-search:find` surface.
  - `chat-search-self-maintained-index` — the plugin-owned FTS5 index.
  - `chat-search-zero-deps-and-resume-handoff` — zero-deps posture + cwd-aware resume.
  - Each entry links to its archive path in the sibling marketplace.

## 7. Verify and commit

- [ ] 7.1 Render MANUAL.md in a terminal pager (`less MANUAL.md`) — confirm headings, code fences, links render readably.
- [ ] 7.2 Render MANUAL.md on GitHub (or via any markdown previewer) — confirm tables, anchors, and the TOC work.
- [ ] 7.3 `make lint-skills` → exit 0.
