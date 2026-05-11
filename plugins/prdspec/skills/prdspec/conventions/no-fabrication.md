# Convention: no fabrication

The framework's most-violated discipline by ungrounded LLMs: inventing plausible-looking links, ticket numbers, ADRs, customer quotes, or compliance controls. **Don't.**

## The hard rule

If an anchor (a link or a citation) cannot be verified against an actual store, surface it as:

```markdown
[GAP: anchor unverified — <what was attempted, what failed>]
```

**Never** include a URL, ticket number, ADR ID, or quote in an artifact unless you have **direct evidence** that it exists. Direct evidence means:

- The PM gave it to you in the exploration or a clarifying answer.
- A search you ran returned it (and you can name the search).
- A previous artifact already cites it (and you re-resolved the citation, see "Re-verification" below).

## What the runbook should do per anchor

1. **Try to verify.** Use the verbs `verify anchor` (URL → reachability check) or `search standing stores` (search engine over declared stores in `AGENTS.md`).
2. **If verification succeeds**, write the anchor with the *why-it-matters* annotation in 1–2 lines.
3. **If verification fails**, write `[GAP: anchor unverified — <reason>]` and continue. Do not invent.
4. **If verification is not possible** in this environment (e.g., DS-EVIDENCE is in Gong and there's no Gong access here), write `[GAP: anchor not verifiable from this environment — <store> requires <access path>]`. Do not pretend to verify.

## Re-verification on each run

Anchors verified in a previous run are not assumed valid in this run. The framework's "fresh agent run" principle requires re-resolution. In practice:

- For URLs the runbook can reach: re-verify with `verify anchor`.
- For stores the runbook can search: re-search and confirm the citation still resolves.
- For stores out of reach (e.g., manual call-recording transcripts): keep the existing anchor as-is and add a comment `<!-- last verified by PM: YYYY-MM-DD -->` if known; otherwise leave verbatim.

## Customer quotes

A quote from a customer call belongs in evidence anchors only if the runbook (or the PM in this run) has direct access to the source — recording timestamp, transcript line, ticket excerpt. Paraphrasing a quote you didn't read is fabrication.

If the PM provided a quote in the exploration, copy it verbatim and cite the exploration snapshot as the anchor. Do not "polish" the wording.

## When in doubt

Mark a `[GAP: ...]` and ask the PM. The cost of asking is low. The cost of a fabricated anchor that propagates through Epic and Story decomposition is real wasted implementer time.
