# AGENTS.md (host-project sample)

> Drop a file like this at the **root of the host project** (the codebase / workspace whose features you're scoping). The `prdspec` runbooks read it on every invocation to find standing knowledge stores. Without it, the runbooks stop and ask for it.
>
> Format is informal Markdown with named blocks. Subagents read each block by heading. Adapt to your stores; mark anything inapplicable as `none` rather than omitting (the runbooks notice missing blocks).

## product

```yaml
product: shift              # used as the prefix for top-level flag names: shift.<slug>
repo:
  url: https://github.com/acme/shift
  default_branch: main
```

## tracker

`/push` is tracker-agnostic. It reads this block, then uses its general knowledge of the declared tracker (consulting vendor docs when uncertain) to perform API calls. The framework cares about logical concepts (epic-link, target-window, flag-name, slug); your tracker has its own field identifiers, which you map here.

### Example: Jira

```yaml
tracker:
  type: jira
  host: https://acme.atlassian.net
  project_key: SHIFT
  credentials_env:
    user: JIRA_USER
    token: JIRA_TOKEN
  issue_types:
    epic: Epic
    story: Story
  field_mappings:
    epic_link: customfield_10014        # Jira's "Epic Link" id (varies per instance)
    flag_name: customfield_10100
    target_window: customfield_10101
    slug: customfield_10102
  notes:
    - "Description format is Atlassian Document Format (ADF), not Markdown."
    - "Custom field IDs come from GET /rest/api/3/field on this Jira instance."
```

### Example: Linear

```yaml
tracker:
  type: linear
  host: https://api.linear.app/graphql
  project_key: SHIFT-2026
  credentials_env:
    api_key: LINEAR_API_KEY
  issue_types:
    epic: Epic                          # Linear uses Project + Issues; "Epic" maps to a parent issue with a label
    story: Issue
  field_mappings:
    epic_link: parentId                 # Linear's parent-issue field on the issue mutation
    flag_name: ~                        # no custom field; mention in description
    target_window: dueDate
    slug: ~                             # no custom field; embed in title
  notes:
    - "Linear's API is GraphQL, not REST. Description accepts Markdown."
    - "Use the IssueCreate / IssueUpdate mutations."
```

### Example: GitHub Projects (v2)

```yaml
tracker:
  type: github-projects
  host: https://api.github.com/graphql
  project_key: PVT_kwDOABCDEF       # GraphQL project node ID
  repo_owner: acme
  repo_name: shift
  credentials_env:
    token: GITHUB_TOKEN
  issue_types:
    epic: issue                       # GitHub doesn't distinguish epics; use a "type:epic" label
    story: issue
  field_mappings:
    epic_link: ~                      # use task-list relationships; or a custom Project field
    flag_name: PVTF_lADOABCDEF        # field node ID for the flag-name field on the project
    target_window: PVTF_lADOABCDEG
    slug: PVTF_lADOABCDEH
  notes:
    - "Issues live in the repo; tracking lives in the project. Push creates the issue, then adds it to the project."
    - "Custom Project fields use field node IDs (not human names). Run a GraphQL query against the project to discover them."
```

### Schema reference (any tracker)

| Field | Required | Purpose |
|---|---|---|
| `type` | yes | Identifier the agent uses (jira, linear, github-projects, asana, notion, shortcut, ...). The agent's general knowledge keys off this. |
| `host` | yes | Base URL the runbook calls. |
| `project_key` (or equivalent: project key, team key, project node ID, workspace ID) | yes | Where new issues land. |
| `credentials_env` | yes | Map of role → env var name. Never hardcode secrets in this file. |
| `issue_types` | yes | Map of framework concepts (`epic`, `story`) to tracker-specific issue type names. |
| `field_mappings` | as needed | Map of framework concepts (`epic_link`, `flag_name`, `target_window`, `slug`, plus any project-specific ones) to tracker-specific field IDs / paths. Use `~` for "no mapping; handle in description." |
| `notes` | optional | Free-text hints to the agent (e.g., description format, API style, gotchas). |

If your tracker isn't in the agent's training data and vendor docs are not reachable, the runbook will surface `[BLOCKED: tracker type "{type}" not known]` and stop. Add a `vendor:` entry below pointing at the tracker's API docs to unblock.

## flags

`/push` is also flag-platform-agnostic.

### Example: LaunchDarkly

```yaml
flags:
  type: launchdarkly
  host: https://app.launchdarkly.com
  project_key: shift
  credentials_env:
    api_key: LD_API_KEY
  default_state: off
  cleanup_ticket_due:
    base: epic.target_rollout_window.end
    plus_days: 28          # framework cleanup discipline: 4 weeks after GA-default
```

### Example: Split

```yaml
flags:
  type: split
  host: https://api.split.io/internal/api/v2
  workspace_id: '00000000-0000-0000-0000-000000000000'
  credentials_env:
    api_key: SPLIT_ADMIN_API_KEY
  default_state: off
  cleanup_ticket_due:
    base: epic.target_rollout_window.end
    plus_days: 28
```

### Example: in-repo `flags.yml` (for projects without a flag platform)

```yaml
flags:
  type: in-repo
  path: ./config/flags.yml      # the runbook reads/writes this YAML directly
  default_state: off
  cleanup_ticket_due:
    base: epic.target_rollout_window.end
    plus_days: 28
```

If the `flags:` block is omitted, `/push` skips flag registration with a surfaced gap. The Epic still pushes; the PM registers the flag manually.

## DS-STRATEGY (DS-STRATEGY)

```yaml
strategy:
  - https://acme.notion.site/Q3-2026-OKRs-abc123
  - https://acme.notion.site/Roadmap-themes-def456
```

## DS-EVIDENCE (DS-EVIDENCE)

```yaml
evidence:
  - source: gong
    url: https://acme.app.gong.io
    access_mode: manual          # subagents cannot read Gong directly; surface as "not verifiable from this environment"
  - source: zendesk
    url: https://acme.zendesk.com/agent
    access_mode: manual
  - source: notion
    url: https://acme.notion.site/Customer-Insights-ghi789
    access_mode: read            # readable via WebFetch / view if path local
```

## DS-ANALYTICS (DS-ANALYTICS)

```yaml
analytics:
  - source: mixpanel
    url: https://mixpanel.com/project/12345
    access_mode: manual
  - source: internal-dashboards
    url: https://dash.internal.acme/looker
    access_mode: manual
```

## DS-COMPLIANCE (DS-COMPLIANCE)

```yaml
compliance:
  - https://acme.vanta.com/controls
  - https://acme.notion.site/SOC-2-controls-jkl012
```

## DS-ARCH (DS-ARCH)

```yaml
arch:
  paths:
    - docs/adr/                  # architecture decision records, per-file
    - docs/architecture/         # diagrams + capability maps
  patterns:
    adr: 'docs/adr/*.md'
```

## DS-CODE (DS-CODE)

```yaml
code:
  paths:
    - services/                  # backend services
    - web/                       # frontend
    - packages/shared/
  excludes:
    - '**/node_modules/**'
    - '**/dist/**'
    - '**/__generated__/**'
  tests:
    paths:
      - services/**/test/
      - web/__tests__/
    patterns:
      - '*.test.ts'
      - '*_test.go'
```

## DS-STANDARDS (DS-STANDARDS)

```yaml
standards:
  - docs/coding-standards.md
  - docs/design-tokens.md
  - docs/runbooks/                # runbook templates, kill-switch examples
  - .agentsmeta/                  # any project-specific agent rules
```

## DS-VENDOR (DS-VENDOR)

```yaml
vendor:
  - integration: jira
    url: https://developer.atlassian.com/cloud/jira/platform/rest/v3/
  - integration: stripe
    url: https://stripe.com/docs/api
```

## dod (project-specific Definition-of-Done items appended to Stories)

```yaml
dod:
  - "Schema migrations are reversible (alembic downgrade tested)."
  - "i18n: any new user-visible string has translation entries for en, fr, de."
  - "PR description references the Confluence runbook for the affected service."
```

## owners

```yaml
owners:
  default_dri: '@pm-team'
  default_tech_lead: '@platform-team'
  designer: '@design-team'
```

---

## Notes for the runbooks

- Anything declared with `access_mode: manual` is **not directly readable** by the runbooks. They will treat citations to those stores as "not verifiable from this environment" and surface as `[GAP: anchor not verifiable from this environment — <store> requires <access path>]`. Verification falls to the PM.
- `code.excludes` short-circuits ripgrep. Add high-noise paths here to keep `/stories` Implementer Context focused.
- `customFields.*` Jira IDs are instance-specific. Get them from `GET /rest/api/3/field` against your Jira and paste the IDs of the custom fields you've configured.
- Credentials are **always** referenced by env-var name (`credentials_env: { user: JIRA_USER, ... }`), never hardcoded in this file.

## What this file is NOT

- Not a configuration for the plugin's behavior (that lives in `plugins/prdspec/`).
- Not the source of truth for any of the standing stores — it's the **map** to them.
- Not where you store secrets. Use your shell / CI / 1Password / etc. and reference env var names.
