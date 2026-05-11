# Verb → tool binding (filesystem backend, v1)

Runbooks reference **verbs**. This file binds verbs to **tools** in the current environment. When an MCP backend ships, this is the only file that changes.

## Conventions used in this file

- **`{workspace}`** — the host project root (the directory where `AGENTS.md` lives). Subagents resolve paths against `{workspace}` unless stated otherwise.
- **`{plugin}`** — the prdspec plugin root (`${CLAUDE_PLUGIN_ROOT}`). Reading templates and conventions resolves against `{plugin}/skills/prdspec/`.
- **`bash_tool`** — the `Bash` tool in Claude Code.
- **`view`** / **`create_file`** / **`str_replace`** — the `Read`, `Write`, and `Edit` tools.
- **`AGENTS.md`** — host-project file declaring standing-store paths and URLs. Subagents read it on every run; if absent, surface as `[GAP: AGENTS.md missing — host project must declare standing stores; see plugin examples/AGENTS.md]`.

## Verb table

| Verb | Implementation | Notes |
|---|---|---|
| **read AGENTS.md** | `view` on `{workspace}/AGENTS.md` | If absent, surface gap and stop. The runbook needs DS-* paths/URLs to populate anchors. |
| **load template** | `view` on `{plugin}/skills/prdspec/templates/{name}.md` | `name` is one of `prd` / `epic` / `story`. |
| **load convention** | `view` on `{plugin}/skills/prdspec/conventions/{name}.md` | `name` is one of `frontmatter` / `gap-protocol` / `no-fabrication` / `parent-chain` / `flag-naming` / `workspace-layout`. |
| **list initiatives** | `bash_tool` running `ls -d 001-* 002-* … archive/[0-9][0-9][0-9]-* 2>/dev/null` from `{workspace}` | Used for initiative-number allocation. |
| **allocate initiative number** | Algorithm in `conventions/workspace-layout.md` § "Initiative-number allocation". Implemented inline by the `/prd` runbook using `bash_tool` for the `ls` step plus pure reasoning for the increment. | If a race produces a collision, surface and stop. |
| **snapshot exploration** | `create_file` → `{workspace}/{NNN}-{slug}/exploration.md` | Refuse if file already non-empty (would lose context); add a new dated section instead. |
| **load parent** | Read frontmatter `parent:` field; `view` the resolved path | See `conventions/parent-chain.md` for path-form rules. If parent missing, stop. |
| **search standing stores (URL-based)** | `bash_tool` with `curl -sSI -m 5 -L -o /dev/null -w '%{http_code}' '<url>'` for reachability; full GET if needed | URLs from `AGENTS.md`. Treat 2xx/3xx as reachable; otherwise surface as unverified. |
| **search standing stores (filesystem)** | `bash_tool` with `rg --line-number --max-count 5 -- '<query>' <store-paths>` | Store paths come from `AGENTS.md`. Limit per-store hits to keep output bounded. |
| **search codebase (DS-CODE)** | `bash_tool` with `rg --line-number --max-count 10 --type-add 'web:*.{ts,tsx,js,jsx}' -t web -t py -t go -- '<pattern>' <code-paths>` | Code paths come from `AGENTS.md`. Used by `/stories` for Implementer Context. |
| **verify anchor** | `bash_tool` with `curl -sSI -m 5 -L -o /dev/null -w '%{http_code}' '<url>'` | Best-effort. Non-2xx/3xx → surface as `[GAP: anchor unverified — HTTP <code>]`. |
| **save PRD draft** | If file does not exist: `create_file` → `{workspace}/{NNN}-{slug}/prd.md`. If file exists: `str_replace` per section, respecting `Approved`-marked sections (see `conventions/frontmatter.md`). | Never overwrite a file with an `Approved` section without re-checking that section's content matches. |
| **save Epic draft** | Same pattern as PRD, target `{workspace}/{NNN}-{slug}/{epic-slug}/epic.md` | Create the `{epic-slug}/` directory if it doesn't exist. |
| **save Story draft** | Same pattern, target `{workspace}/{NNN}-{slug}/{epic-slug}/stories/{story-slug}.md` | Create `stories/` if it doesn't exist. |
| **list epics for an initiative** | `bash_tool` with `find {workspace}/{NNN}-{slug} -maxdepth 2 -name epic.md -print` | Used by `/epics` to detect existing epics when iterating. |
| **list stories for an epic** | `bash_tool` with `ls {workspace}/{NNN}-{slug}/{epic-slug}/stories/*.md 2>/dev/null` | Used by `/stories` and `/push`. |
| **call tracker API** | `bash_tool` with `curl` (or another HTTP client of your choice) against the endpoint(s) declared in `AGENTS.md` `tracker:` block. Credentials from env vars named in `tracker.credentials_env`. | Tracker-agnostic. The agent uses general knowledge of the declared tracker type; if uncertain about current API shape (e.g., payload format, auth header form, pagination), consult vendor docs via **WebFetch** or `mcp__context7__query-docs` *before* making destructive calls. Never hardcode tracker names in artifacts; field mappings come from `AGENTS.md` `tracker.field_mappings`. |
| **register flag** | `bash_tool` with `curl` (or another HTTP client) against the platform API declared in `AGENTS.md` `flags:` block | Platform-agnostic. If `flags:` is absent, surface the gap and skip flag registration (do not invent a target). Same vendor-doc deferral as `call tracker API` if uncertain. |
| **write back tracker IDs** | `str_replace` on the artifact's frontmatter `Tracker ID:` line, replacing the placeholder with a Markdown link to the issue: `[{key}]({url})` | Only `/push` writes this field. The artifact stays the source of truth; the link is the back-pointer. |
| **resolve user handle** | If the tracker exposes a search endpoint, `bash_tool` with `curl` against it; otherwise treat `@handle` as opaque and write to a free-text field | Used for assignee resolution. If the tracker can't accept `@handle` directly and search is unavailable, surface `[GAP: cannot resolve assignee {handle} on this tracker]` and leave assignee unset. |
| **consult vendor docs** | `WebFetch` for a vendor URL declared in `AGENTS.md` `vendor:` block; `mcp__context7__query-docs` for libraries indexed by context7 | Used by `/push` (and potentially other runbooks) when the agent is uncertain about a current API shape. Prefer this over guessing — vendor docs are authoritative; agent training data may be stale. |

## Migration path (future state)

When the prdspec MCP server ships, this table becomes:

| Verb | Implementation |
|---|---|
| **load template** | `mcp__prdspec__templates_read(name)` |
| **save PRD draft** | `mcp__prdspec__prd_save(slug, content)` (server enforces approved-section immutability) |
| **search standing stores** | `mcp__prdspec__stores_search(query, store_ids)` |
| **verify anchor** | `mcp__prdspec__anchors_verify(url)` (server-checked, not best-effort) |
| **call tracker API** | `mcp__prdspec__tracker_push(epic, stories)` (server reads `AGENTS.md`, dispatches to a per-tracker adapter) |
| **register flag** | `mcp__prdspec__flags_register(name, owner, runbook, cleanup_ticket)` (server dispatches to a per-platform adapter) |

The runbooks in `commands/` will not need to change — they reference verbs only. Approved-section immutability (today by convention) becomes server-enforced; anchor verification (today best-effort) becomes server-checked. The tracker / flag-platform agnosticism is preserved at the MCP layer: the server takes the same `AGENTS.md` declaration and routes to the appropriate adapter.

## Things this binding is not

- A guarantee that anchor verification will catch every broken link. `curl -I` follows redirects and treats 2xx/3xx as success — but a 200 OK can still serve a "page not found" body. The `no-fabrication` convention requires re-resolution on each fresh run; that's the discipline this binding supports, not a substitute for human verification.
- A tracker-specific connector library. Runbooks defer to the agent's general knowledge of whichever tracker `AGENTS.md` declares, with vendor-doc consultation when uncertain. When that gets unwieldy in practice (frequent guesses, frequent vendor-doc lookups for the same fields), that's the signal to ship a per-tracker adapter behind the MCP layer rather than embedding tracker logic into runbooks.
- A way to silently resume an in-flight run. If the runbook re-enters mid-stream and finds a partially written artifact, it surfaces the situation and asks the PM rather than continuing.
