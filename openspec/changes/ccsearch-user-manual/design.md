## Context

The user has two scattered spec sources for ccsearch:

1. **Sibling-repo OpenSpec archives** at `/home/data/repos/github.com/krmrn42/skills/openspec/changes/archive/2026-05-10-*` — four older changes covering the plugin scaffold, slash command, self-maintained index, and zero-deps/resume-handoff posture. These are formal `proposal.md` / `design.md` / `tasks.md` triples scoped to feature deltas, not user-facing documentation.

2. **This-repo `openspec/specs/`** — four newer ADDED-Requirements specs lifted from the recently-archived changes: `ccsearch-cli-help`, `ccsearch-default-mode`, `ccsearch-recent-browse`, `ccsearch-dangerous-resume`.

In addition, six in-flight proposals are about to add more behavior. A user trying to understand `ccsearch` today has to read these eight + six sources (plus the README), which is a non-starter.

The manual's job is **synthesis at the feature level**, not duplication. A user reads it once to learn what's possible, then refers back when they forget a keybinding or a flag. The specs remain the authority for *requirements*; the manual is the authority for *use*.

## Goals / Non-Goals

**Goals:**

- A single, linear-readable document that takes a new user from "I just installed the plugin" to "I'm using every picker action confidently" in 10–15 minutes of reading.
- Each picker action has its own subsection with examples; each CLI flag is referenced once in a compressed table that points to `--help` for the canonical version.
- The structure is the user's mental model (open the picker → do things in the picker → use one-shot mode → understand the index), not the code's structure.
- Update discipline: any change that adds a feature also touches MANUAL.md. We codify this in the capability spec so it's enforceable in PR review.

**Non-Goals:**

- Replacing the README or the specs. README stays the project overview; specs stay the authority on requirements; manual is the user-facing tour.
- A man page (`ccsearch.1`). The manual's source-of-truth nature makes a man page redundant; if demand emerges, we can generate one from the same markdown.
- Tutorials beyond the quick-start. The manual is a reference + walkthrough, not a multi-chapter tutorial.
- Screenshots / GIFs. Plain markdown only. The TUI doesn't reproduce well in screenshots; descriptive text is more durable.
- Translation. English only.

## Decisions

### Decision 1: Structure is workflow-first, reference last

The 10-section structure (proposal §What Changes) is workflow-ordered: quick-start → picker → picker actions → mutation → one-shot → slash-command → index → reference appendix → troubleshooting → compatibility. The user reads top-to-bottom once; on return visits they jump to the reference appendix or the picker keybindings table.

**Alternative considered: reference-first (à la man pages)** with synopsis, options, then prose. Rejected — `--help` already does that. The manual's job is to complement, not duplicate.

### Decision 2: Cross-references to specs are footer-style

Inside each section, the manual describes what happens without footnoting which capability spec covers it. At the end of each section there's a single `> spec: openspec/specs/ccsearch-<capability>/spec.md` line in dim/quoted format. Users who want the formal definition follow the link; everyone else doesn't trip over it.

This keeps the manual readable as prose rather than a forest of citations.

### Decision 3: Placeholders for in-flight features, removed on merge

For the five other in-flight proposals (rename, pin, remote-control, tmux, status-bar), the manual ships with subsections marked **🚧 Not yet implemented (proposed in `openspec/changes/<name>/`)** containing the *intended* behavior from the proposal. When the parallel change merges, its implementer removes the placeholder banner and confirms the content matches the as-shipped behavior.

This avoids the alternative of "manual lands empty and gets fleshed out per-change" which would dilute the manual's value during the in-flight window.

### Decision 4: The README pointer is minimal, not duplicative

The README gains exactly one paragraph near the top:

> **Looking for usage docs?** See [MANUAL.md](./MANUAL.md) for the user manual. This README is the project overview and contributor reference.

That's the entire README change. We don't restructure the README — its current shape (overview / architecture invariants / contributing) is correct for what it is.

### Decision 5: Update discipline is part of the spec

The `ccsearch-user-manual` capability spec has a requirement: "Any change that adds a picker keybinding, CLI flag, or user-visible behavior MUST update the corresponding section of MANUAL.md in the same change-set." This makes manual drift a spec violation, not a forgettable nice-to-have. Future OpenSpec changes that touch behavior either update the manual or document why they don't.

### Decision 6: Origins note credits the sibling repo

A small "Origins" section at the very bottom credits the four older changes that shaped ccsearch's foundation. One line per change, linking to the sibling-repo archive paths. This is the user's "older features are speced in `../skills/`" request honored as a one-screen footnote rather than scattered breadcrumbs.

## Risks / Trade-offs

- **Risk: drift between manual and behavior.** Mitigation: §Decision 5's update-discipline requirement. We accept that periodic audits will be needed; the alternative (no manual) is worse.
- **Risk: 900-line markdown is intimidating.** Mitigation: a table of contents at the top, generous use of headings and short sections. Users mostly jump in via search-in-page or anchor links.
- **Trade-off: maintaining the manual is real work.** Worth it because the alternative is users reading specs.

## Open Questions

- Should the manual be split into multiple files (`MANUAL/picker.md`, `MANUAL/one-shot.md`)? Possibly later if it grows beyond ~1000 lines. For now, single file aids search-in-page and avoids navigation overhead.
- Should there be a `ccsearch help <topic>` CLI command that pages the relevant section? Maybe, but `less MANUAL.md` works fine and doesn't add a dependency. Defer.
