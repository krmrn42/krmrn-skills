# Naming decision: `ccsearch` → `multivac`

**Status:** Decided · **Date:** 2026-05-19 · **Decided by:** Shavkat (via brainstorming session)

## Context

The `chat-search` plugin ships a Node CLI under `bin/ccsearch` that maintains its own SQLite FTS5 index of all locally stored Claude Code conversations (`~/.claude/projects/**/*.jsonl`) and offers two surfaces: a TUI picker for recognize-and-resume across projects, and a one-shot ranked text/TSV mode for scripting. The CLI is also wrapped by the `/chat-search:find` slash command and the `/chat-search:setup` PATH symlinker.

We are extracting that CLI into a standalone npm package under the `@krmrn42` scope so it can:

- be installed and updated outside the plugin lifecycle (`npm i -g @krmrn42/<name>`)
- evolve to index AI chat archives from tools beyond Claude Code (Cursor, Aider, ChatGPT/Gemini exports, Copilot logs)
- be consumed by the `chat-search` plugin as a dependency rather than ship its source

This record captures the name selected for both the npm package and the on-PATH binary, and the reasoning. The extraction work itself happens in a separate thread.

## Decision

- **npm package:** `@krmrn42/multivac`
- **CLI binary:** `multivac`
- **Tagline:** *Ask Multivac. — Cross-tool full-text recall across your local AI chat archives.*
- **Source universe:** Asimov. Multivac is the fictional planetary AI that answers questions by searching a continuously accumulated archive of past human-machine dialogue across generations (canonically *The Last Question*, 1956; *All the Troubles of the World*, 1958).

## Rationale

### Scope the name commits to

"AI chat archives, across tools." Claude Code today; plausibly Cursor, Aider, ChatGPT/Gemini exports, Copilot logs in the future. Explicitly not broader (we are not branding a generic local FTS indexer or a Spotlight-for-dev-artifacts), and explicitly not narrower to Claude Code only.

### Semantic fit

In Asimov, Multivac's job is exactly what this tool does:

- accepts a query
- searches a vast accumulated archive of past dialogue and computed knowledge
- returns ranked answers grounded in that archive
- accumulates across decades, sessions, generations

The verb form reads naturally in docs and shell: `multivac "session timeout"` looks like a question being asked of Multivac. "Ask Multivac." works as a tagline.

### Ergonomics on PATH

- 8 characters; comfortable to type.
- `multi*` is a moderately populated prefix on typical dev machines (e.g. `multitail`, `multilog`, `multiwatch`); tab-completion typically resolves at `multiv<TAB>` (6 chars). Acceptable.
- No awkward bigrams or hand alternation issues.

### Verified availability (2026-05-19)

| Check | Result |
|---|---|
| `https://registry.npmjs.org/multivac` | 404 — unscoped name available |
| `https://registry.npmjs.org/@krmrn42/multivac` | 404 — scoped name available |
| `which multivac` on development machine | not found |
| Common-knowledge collision (existing CLI, library, framework) | none identified |

The unscoped `multivac` is also unpublished; publishing only under `@krmrn42/` is fine, and the absence of a popular unscoped occupant reduces ambient confusion in logs, grep, and search.

### Distinctiveness

`multivac` has essentially no SEO competition outside Asimov fandom and a handful of small unrelated repos. Project searches, GitHub Code Search hits, and "what is this?" questions resolve cleanly to our package.

## Alternatives considered

| Candidate | Universe | Why rejected |
|---|---|---|
| `bestiary` | Witcher | Strong on ergonomics — `best<TAB>` tab-completes near-instantly, no PATH collisions. Rejected for weaker semantic fit: a bestiary is a *catalog of encountered creatures*, not a *search-and-recall engine over past dialogue*. The metaphor strains when mapping chats → monsters. |
| `braindance` | Cyberpunk 2077 | Narratively the most perfect match (a recorded, scrubbable, searchable experience). Rejected on length (10 chars) and aesthetic — feels too genre-specific for a long-lived utility, where `multivac` reads as more timeless. |
| `mentat` | Dune | Semantically excellent (Mentats are human search-and-recall engines, and the Mentat Trance is the act of querying their internal archive). **Disqualified** by PATH collision: AbanteAI ships an actively maintained CLI coding assistant named `mentat` ([AbanteAI/mentat](https://github.com/AbanteAI/mentat)). |
| `gesserit` | Dune | Bene Gesserit Other Memory ≈ searchable ancestral archive. Rejected as too heavy / cultish in feel for a small utility. |
| `relic` | Cyberpunk 2077 | Short and clean (Johnny Silverhand's stored personality as queryable biochip), but more "stored thing" than "search and recall." |
| `kaer` | Witcher | Very short (4 chars), but "fortress" (as in Kaer Morhen) does not carry the right meaning. |
| `chat-search`, `chatfind`, `aichat-grep` | descriptive | Rejected per explicit preference for a thematic deep cut over a descriptive name. |

## Consequences

### What this commits us to

- The new package is `@krmrn42/multivac`; the binary it ships is `multivac`.
- The `chat-search` plugin's `bin/ccsearch` becomes a thin wrapper around — or dependency on — the published `@krmrn42/multivac`. The exact relationship (vendor vs. depend vs. delete the plugin copy) is for the extraction thread to decide.
- `/chat-search:find` and `/chat-search:setup` continue to exist as plugin-side UX, but their underlying invocation targets `multivac`.
- README/MANUAL prose changes from "ccsearch" → "multivac", with a backward-compat note.

### Backward compatibility

`ccsearch` has been on users' PATHs (via `/chat-search:setup` symlink) for the lifetime of the plugin. The extraction thread should decide whether to:

- ship a `ccsearch` alias / symlink alongside `multivac` for one release cycle, then deprecate, or
- hard-cut and document the rename in the plugin's CHANGELOG and slash-command output.

This decision record does not pre-judge that question — it belongs in the extraction plan.

### Naming hygiene going forward

If Multivac later grows to index non-AI-chat archives (shell history, notes, browser history), this name will no longer fit and a second rename would be warranted. The "AI chat archives across tools" scope is the explicit boundary this name commits us to.

## Open questions for the extraction thread

1. Backward-compat alias strategy for `ccsearch` (see above).
2. Whether the plugin still vendors `picker.js` or also pulls it from `@krmrn42/multivac`.
3. Version reset (start at `0.1.0`?) or continue from `chat-search`'s current version.
4. Whether `multivac --help` retains chat-search-specific phrasing or moves to source-agnostic language now, in anticipation of the multi-tool scope.

## References

- Source plugin: [`plugins/chat-search/README.md`](../../plugins/chat-search/README.md), [`plugins/chat-search/MANUAL.md`](../../plugins/chat-search/MANUAL.md)
- Brainstorming session: 2026-05-19 (this file is the captured outcome)
- Asimov, *The Last Question* (1956) — canonical Multivac story illustrating the cross-generational accumulated-query semantics
- Asimov, *All the Troubles of the World* (1958) — Multivac as queryable knowledge oracle
