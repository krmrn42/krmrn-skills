---
title: Auto-suggest slugs from titles in /prd
status: parked
created: 2026-05-09
last-touched: 2026-05-09
related-to: commands/prd.md, conventions/workspace-layout.md, conventions/frontmatter.md
unlocks-when: pilot shows that PMs find the explicit-slug requirement an unnecessary friction; OR a slug-collision incident reveals that human-picked slugs need a sanity check.
promoted-to:
---

# Auto-suggest slugs from titles in `/prd`

## Context

Today, `/prd` requires the PM to supply a slug as the argument: `/prd semantic-search`. The runbook does not auto-derive a slug from the exploration's title.

This is a deliberate v1 choice — explicit slug means:

- Predictable: the PM knows exactly what filename will be created.
- Reversible: if the PM mis-typed, they can re-run with a different slug before any artifact is committed.
- No "magic": no LLM-generated slug to argue with.

But it has costs:

- The PM has to think of a slug before they can start. That's a small but real interruption to the exploration → PRD flow.
- Slugs sometimes diverge from titles in ways that hurt readability later (PM types `ss` for `semantic-search` because they're in a hurry).
- The PM may not realize a slug collision exists until they re-read `prd.md` and notice the directory matches an archived initiative.

## Proposal

`/prd` accepts the slug as optional. When omitted:

1. The runbook reads the exploration's effective title (first H1 if present; otherwise the PM is asked).
2. Generates a kebab-case slug candidate by trimming filler words ("the", "a", "for") and common suffixes ("v2", "mvp"), then asks the PM to confirm.
3. Surfaces existing slugs (active + archived) that are similar (Levenshtein distance ≤ 2 or sharing a noun-phrase) so the PM can opt to reuse-or-rename rather than collide.
4. If the PM accepts, proceeds. If they reject, prompts for an explicit slug.

The behavior is **suggest, don't decide** — the PM remains the authority. The runbook simply lowers the activation cost.

## Use cases

- **First-time `/prd` users.** Lower the friction for someone evaluating the framework. They don't need to learn the slug discipline before their first PRD.
- **Refinement runs.** When `/prd` is invoked against an existing PRD path, the slug is already determined; no behavior change.
- **Bulk seeding.** A PM batch-imports several explorations into PRDs. Hand-picking slugs becomes the bottleneck; the suggester removes it.

## Trade-offs / open questions

- **LLM-generated slugs can be bad.** "Improving the search experience for our customers" might get slugged as `improving-search-experience` — too long, too verbose. Need to constrain length (max 4 words?).
- **Slug collisions are subtle.** "search-mvp" and "search-v2" might both be valid initiatives but easy to confuse. The similarity check needs to surface the candidate without blocking.
- **Title may not exist yet.** Early exploration is often a chat, not a titled document. The suggester needs a fallback to ask the PM "what's this about, in 4-6 words?" rather than guess.
- **Locale.** A non-English exploration would need slug derivation in that language (or transliteration to ASCII). Out of scope for first cut.

## Why we're parking it

- v1's explicit-slug requirement is fine for a pilot. The friction is small.
- A bad auto-derived slug is worse than a small friction — it would ship a misleading filename that the PM might not notice for weeks.
- This is a pure UX improvement; we should pilot v1 first to confirm there's a real friction here before solving for it.
