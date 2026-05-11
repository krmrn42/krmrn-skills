# Convention: gap protocol

When a slot in a template can't be filled with confidence, **surface a gap rather than fabricate**.

## Marker form

Inline:

```markdown
[GAP: <one-line description of what's missing and what would resolve it>]
```

Examples:

- `[GAP: aha event not defined; need analytics owner to specify the funnel step]`
- `[GAP: no compliance constraint cited; verify with Legal whether GDPR Article 22 applies]`
- `[GAP: appetite not stated; PM to confirm S/M/L]`
- `[GAP: anchor unverified — Mixpanel cohort URL returns 404]`

A single gap marker is one line. If the gap needs more context, add a follow-up `> *Context: ...*` blockquote on the next line.

## Where gaps go

Inline, in the section where the missing information would belong. Never collected at the bottom — the section that needs it is the section that surfaces it.

## When to ask

After the runbook's first pass, identify the **3–5 highest-leverage** gaps — the ones that block downstream slots — and ask the PM clarifying questions before drafting dependent slots.

Highest-leverage means: gaps whose answers would change the shape of the artifact, not just fill a sentence. The aha event in §9 cascades into §5 outcomes. The appetite in §4 cascades into §10 rollout. Ask those first.

Do **not** dump every empty slot as a question. The runbook should fill what it can, mark what it can't, and ask only what would change the next pass.

## When the PM doesn't know

A gap that the PM can't resolve in one round stays as `[GAP: ...]` in the artifact. Downstream artifacts inherit it explicitly:

- An Epic inheriting a gappy PRD cites the gap in its §2 (Inherits from PRD): `[GAP inherited from PRD §5: outcome metric not defined; we proceed assuming activation rate, to be confirmed]`.
- A Story inheriting a gappy Epic does the same in its §2.

This way gaps don't silently propagate as fabricated context.

## When NOT to mark a gap

- The slot has a sensible **N/A** because it doesn't apply (e.g., AI governance for a non-AI feature). Use `**N/A**` with a one-line reason instead.
- The slot is filled with a placeholder that will be resolved by the next runbook (e.g., `Tracker ID:` is empty until `/push` runs). These are normal pipeline slots, not gaps.
