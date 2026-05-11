---
title: A /future-work workflow for managing this registry
status: parked
created: 2026-05-09
last-touched: 2026-05-09
related-to: future-work/ (self-referential), commands/prd.md (as integration point)
unlocks-when: the registry has accumulated >15 entries and is becoming unwieldy to scan manually; OR a `/prd` invocation finds itself manually reading future-work/ files for prior-art; OR a PM asks for "a way to add and search ideas."
promoted-to:
---

# A `/future-work` workflow for managing this registry

## Context (meta)

This entry is itself the first occupant of the registry it describes. The registry exists; the workflow for managing it does not. Everything today is filesystem operations: create a markdown file, edit it, move it to `archive/` if dropped.

That's fine for a small registry. It scales poorly when:

- Entries pile up and it's hard to find related ones.
- Status field needs updating across many entries (last-touched dates, especially).
- A new PRD wants to scan for prior-art future-work entries and there's no programmatic way to do that.
- A new contributor doesn't know the entry format and produces malformed entries.

## Proposal

A `/future-work` slash command with subcommands:

### `/future-work add <slug>`

Drafts a new entry from a brief description. Asks 2–3 clarifying questions (related-to, unlocks-when, why parked) and writes the file with frontmatter populated.

### `/future-work list [--status=<filter>] [--related-to=<query>]`

Lists entries matching the filter. Default: all `parked` and `exploring`. Useful as a quick scan tool ("what have we parked about flag-naming?").

### `/future-work touch <slug>`

Updates `last-touched: YYYY-MM-DD` to today. Used when revisiting an entry without modifying its content. Helps the PM see which entries have been re-read recently vs. truly idle.

### `/future-work promote <slug>`

Transitions an entry from `parked` / `exploring` to `promoted`. Sets the `promoted-to` frontmatter field (asks for the PRD slug or path). Suggests running `/prd <new-slug>` next, with the future-work entry pre-pasted as exploration context. The new PRD's §13 Anchors → Prior art automatically links back to the future-work entry.

### `/future-work drop <slug> [reason]`

Transitions an entry to `dropped`, capturing the reason. The entry stays in place — never delete history.

### `/future-work scan-for-prd <slug>`

Called from `/prd`. Searches the registry for entries whose `related-to` field, title, or body mentions terms drawn from the new PRD's title/exploration. Surfaces matches as candidate prior-art for the PRD's §13.

## Use cases

- **Capture friction is the bottleneck.** A PM noticing something in the middle of `/epics` doesn't want to context-switch to "manually create a markdown file with the right frontmatter." `/future-work add` makes the capture cheap.
- **Strategic alignment.** Before authoring a PRD, the framework should help the PM ask "have we already parked anything about this?" Automated via `/future-work scan-for-prd`.
- **Quarterly review.** Leadership asks "what's parked that we should consider for next quarter?" `/future-work list --status=parked --sort=last-touched` is the report.

## Trade-offs / open questions

- **Yet another workflow.** The framework's strength is its narrowness — four entry points, three artifacts. Adding a fifth workflow risks scope creep. Maybe `/future-work` should ride the existing commands (e.g., `/prd` automatically scans future-work; `/epics` auto-suggests parking ideas it discovers).
- **Frontmatter rigor.** A workflow that writes frontmatter expects a fixed schema. If the registry's schema evolves, the workflow has to follow.
- **Editor vs. workflow.** Some PMs prefer plain-file editing. A `/future-work` workflow shouldn't be the *only* way to manage the registry — the markdown files must remain hand-editable.
- **Where does the workflow's prose live?** A new `commands/future-work.md`? Or as subskills under the prdspec skill? Probably the same shape as the existing four commands.
- **Cross-references.** Should entries auto-link to each other when their bodies mention each other? Today's manual linking works; a workflow could verify links resolve.

## Why we're parking it

- The registry doesn't yet exist in usage — only in shape. We don't know how PMs will actually use it.
- A workflow that automates a manual process should follow real-world friction, not preempt it.
- This is the framework's first "tooling on top of the framework" candidate — worth being conservative about whether to build it. The four existing runbooks already do a lot; adding more should clear a high bar.
- Recursive elegance: this entry exists in the registry, the registry's first proof that it works as a registry. Whether to formalize it into a workflow is itself a future bet.
