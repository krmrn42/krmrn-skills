---
title: Anchor verification beyond HTTP status
status: parked
created: 2026-05-09
last-touched: 2026-05-09
related-to: tools.md `verify anchor` verb, conventions/no-fabrication.md
unlocks-when: pilot reveals systematic anchor rot (e.g., Mixpanel cohort URLs returning 200 OK for "cohort not found" pages); OR a regulated user requires content-level verification; OR the prdspec MCP server ships and can carry a richer verifier.
promoted-to:
---

# Anchor verification beyond HTTP status

## Context

`tools.md` binds `verify anchor` to `curl -sSI -m 5 -L -o /dev/null -w '%{http_code}'`. Treats 2xx/3xx as reachable.

This is **best-effort** for several reasons:

1. **A 200 OK can serve a "not found" body.** Modern SPAs render their not-found UI client-side; the server returns 200 with an empty shell that JavaScript later populates with the not-found message. `curl` sees 200; the PM sees "page not found" in their browser. Anchor passes verification but is dead.
2. **A 200 OK can serve stale or generic content.** A Mixpanel cohort URL might 200 even after the cohort is deleted, returning a generic "select a cohort" page.
3. **Auth walls 200-OK.** A page behind SSO returns 200 with the SSO login form. The anchor "works" from the verifier's perspective but only authenticated humans see real content.
4. **Redirects mask intent.** `curl -L` follows redirects; a 301 to "/login" or "/legacy/archived" is silently followed and returns 200 from the destination.

The `no-fabrication` convention requires re-resolution on every fresh agent run, which limits the damage. But the verifier itself is the weakest link.

## Proposal

A richer `verify anchor` verb that performs content-level checks. Levels of investment:

### Level 1: heuristic content scanning

After fetching, scan the response body for known not-found indicators:
- `<title>...not found...</title>` (case-insensitive).
- Presence of "404" in heading text.
- Login-form indicators (a `<form action="/login">` with no other content).
- Empty-cohort indicators specific to common analytics platforms.

Surface a `[GAP: anchor returns 200 but body looks like not-found / login wall]` instead of marking verified.

### Level 2: store-aware probes

For known stores declared in `AGENTS.md` (Mixpanel, Amplitude, Notion, Linear, Jira, etc.), the verifier knows the API endpoint that authoritatively answers "does this resource exist?":

- A Notion URL `notion.site/<workspace>/<page-id>` is verified by a GET against the Notion API page endpoint with that ID.
- A Mixpanel cohort URL is verified by a GET against the Mixpanel cohorts API with that cohort ID.
- A Jira ticket URL is verified by a GET against `/rest/api/3/issue/<key>`.

This requires authentication (the verifier needs the same credentials the user has) but is far more reliable than HTML scraping.

### Level 3: semantic verification

Beyond existence, verify that the anchor's *content* matches its *why-it-matters* annotation. Example:

- Anchor reads "Customer call: Acme Corp, 2026-04-12 — Source for the activation friction in §1."
- Verifier checks: does the linked transcript actually mention activation friction?

This is full-text retrieval against the linked content, requiring access to the underlying call transcript / ticket / dashboard. Probably an LLM-assisted check rather than keyword match.

## Use cases

- **Compliance audits.** Annual audit asks: "show me that every compliance anchor in this PRD still resolves to the cited control." Today: manual review. With Level 2: automated.
- **Long-running initiatives.** A PRD authored in Q1 might be re-shaped in Q3. Cohort URLs from Q1's analytics anchors may have rotted (cohorts deleted, dashboards renamed). The verifier should catch this on the Q3 re-shape, not silently propagate dead links into Epics.
- **Onboarding new agents.** A future agent type (architecture review, security review) operating against the same artifacts wants to know which anchors are reliable. A verifier with content checks gives them that signal.

## Trade-offs / open questions

- **Auth surface.** Level 2 requires the verifier to hold (or be passed) credentials for every store. That's an attractive attack surface.
- **Rate limits.** Aggressive verification against external APIs gets rate-limited fast. The verifier needs caching with sane TTLs.
- **False negatives.** Level 1 heuristics will have false negatives (some valid pages have "not found" in their copy for unrelated reasons). Need to surface as a *suspicion* rather than a confirmed gap.
- **Cost.** Level 3 (semantic) is expensive per anchor. Likely run on demand (PM-triggered "verify all anchors in this PRD") rather than every fresh run.

## Why we're parking it

- Filesystem backend can't carry credentials safely. Level 2+ probably belongs in the MCP server, where credential handling is centralized.
- Until pilot usage shows real incidents of anchor rot leading to bad downstream artifacts, the existing best-effort verification is acceptable. The discipline (re-verify every run, surface gaps) is doing the real work.
- Risk of over-engineering: spending a quarter on a verifier when a quarter on `/push` improvements would deliver more user value.
