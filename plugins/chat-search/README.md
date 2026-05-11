# chat-search

Cross-project full-text search across all locally stored Claude Code conversations.

Claude Code's built-in `/resume` picker (with `Ctrl+A`) only filters by chat **title**. This plugin maintains its own SQLite FTS5 index, built from the raw conversation JSONL files under `~/.claude/projects/`, and exposes it as a relevance-ranked search across **message bodies**, across all projects on the machine. Pick a result, hit Enter, and you land in that resumed session — automatically in the right project directory.

## What it does

- Maintains a plugin-owned FTS5 index at `$XDG_DATA_HOME/krmrn42-skills/chat-search/index.db` (default: `~/.local/share/krmrn42-skills/chat-search/index.db`), populated from `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl`. The JSONL tree is what Claude Code keeps current; our index lives separately and is refreshed lazily on every `ccsearch` invocation.
- Aggregates per-conversation: one row per chat, with the highest-scoring matched message's snippet.
- Ranks by FTS5 BM25 across the full set — projects compete on the same scoreboard.
- Three surfaces, one binary:
  - `ccsearch [<query>]` (on a TTY) — opens the built-in TUI picker by default. Enter resumes in the conversation's original project directory; Ctrl-F forks; Ctrl-O prints session id; Ctrl-D prints project path. With an empty query, the picker shows your most recent conversations across all projects — each row shows a synthesized title (first non-wrapper user message) plus the tail of the last message, so `ccsearch` becomes a recognize-and-resume entry point. `-i` / `--interactive` forces the picker explicitly (default kept for backward-compat scripts).
  - `ccsearch <query>` (piped or with `--list` / `--format=text|tsv` / `--regex`) — one-shot ranked output (`text` on TTY when `--list`/`--format=text`, `tsv` when piped). Each text row carries a copy-paste resume one-liner.
  - `/chat-search:find` — slash command that renders the top 10 results inline in a Claude Code session, each with the same copy-paste resume one-liner. (Unaffected by the picker default: passes `--format=text` explicitly.)
- Indexer maintenance:
  - First invocation: full build of all on-disk conversations. Expect ~30–90 seconds for several hundred sessions.
  - Subsequent invocations: incremental refresh only — files whose mtime hasn't changed are skipped (sub-second).
  - `ccsearch --reindex` forces a full rebuild.
  - `ccsearch --index-status` prints DB path, size, message/conversation count, last refresh time, and any pending files.

## Install

```
/plugin marketplace add /home/data/repos/github.com/krmrn42/skills
/plugin install chat-search@krmrn42-skills
```

**Inside Claude Code**, you're done — the plugin's `bin/` directory is automatically added to the `Bash` tool's `PATH`, so `/chat-search:find` and the bundled `ccsearch` command both just work.

**From your own shell** (outside Claude Code), run once:

```
/chat-search:setup
```

That symlinks `bin/ccsearch` into `~/.local/bin/ccsearch` (creating the directory if needed) and tells you whether `~/.local/bin` is already on your `$PATH` — if not, it prints the export line for your shell. The setup command never edits your shell-rc files itself.

### Runtime dependencies

| Tool | Version | Why |
|---|---|---|
| `node` | ≥ 22.5 | Uses the built-in `node:sqlite` module (added in 22.5). No `npm install` step. |

That's it. No Python, no `fzf`, no native compilation. `claude` is on your PATH by virtue of installing Claude Code, so we don't count it as an extra dependency.

### Where the index lives

| Path | What |
|---|---|
| `$XDG_DATA_HOME/krmrn42-skills/chat-search/index.db` (default `~/.local/share/...`) | Plugin-owned SQLite FTS5 index |
| `~/.claude/projects/**/*.jsonl` | Source of truth — read by the indexer, never modified |
| `~/.claude/conversation-search.db` | **Not touched** by default. Override with `--db-path` if you want to read it. |

To wipe the index (it will rebuild on next `ccsearch`):

```bash
rm -rf ~/.local/share/krmrn42-skills/chat-search/
```

If your Node is older than 22.5, `ccsearch` exits with a clear error and per-OS install commands. The Claude Code native installer ships its own binary and does not require Node — if you used that channel, you may need to install Node separately:

```
brew install node              # macOS (Homebrew)
winget install OpenJS.NodeJS   # Windows (WinGet)
sudo pacman -S nodejs          # Manjaro / Arch
sudo apt install nodejs        # Debian / Ubuntu (Ubuntu 22.04 ships 12.x; consider nvm or nodesource)
nvm install --lts              # any (using nvm)
```

## Use it

```bash
# basic search — defaults to `user` and `assistant` messages
ccsearch "session timeout"

# interactive picker
ccsearch -i

# pre-fill the picker with a query
ccsearch -i "regex parse"

# also search tool-call rows (commands you ran, output you saw)
ccsearch --include-tools "ls -la"

# regex post-filter on FTS candidates (fast)
ccsearch "auth" --regex 'TOKEN_[A-F0-9]{8}'

# regex full-table scan (slow but no FTS prefilter — for patterns FTS can't help with)
ccsearch --regex 'TOKEN_[A-F0-9]{8}' --scan

# scope to a project
ccsearch "deploy" --project noorriver

# scope to a date range
ccsearch "deploy" --since 2026-04-01

# limit results
ccsearch "deploy" --limit 5

# pipe-friendly output for scripts
ccsearch "deploy" --format tsv | head -3
```

### Picker keybindings

| Key | Action |
|---|---|
| `↑` / `↓` (or `Ctrl-K` / `Ctrl-J`) | Move selection |
| `PgUp` / `PgDn` | Page through results |
| `Enter` | `cd <project> && claude --resume <id>` for the selected row |
| `Ctrl-F` | `cd <project> && claude --fork-session --resume <id>` |
| `Ctrl-R` | Rename the selected row (saved name persists, passed to `claude --name`) |
| `Ctrl-P` | Pin / unpin the selected row (pinned rows sort to the top with a `📌` indicator) |
| `Ctrl-T` | Resume with `claude --remote-control [name] --resume <id>` (uses saved name when set) |
| `Ctrl-W` | Resume in a new tmux window (requires running inside tmux; `--no-tmux` disables) |
| `Ctrl-O` | Print the session id and exit |
| `Ctrl-D` | Print the original project path and exit |
| `Backspace` | Delete the last query character |
| `Ctrl-U` | Clear the query |
| `Esc` / `Ctrl-C` | Cancel cleanly (exit 0) |

After `claude` exits (Enter / Ctrl-F), your parent shell's working directory is unchanged — the resume's `cd` only affects the spawned `claude` process.

## Why this exists

`/resume` (with `Ctrl+A`) searches **chat titles** only. Most of the time when I want to find a past conversation, I remember something from the body — an error message, a function name, a phrase from a discussion — not the title. Reaching for `grep -r ~/.claude/projects/` works but is slow, returns raw JSONL, has no ranking, and doesn't aggregate per-conversation. `ccsearch` is the missing surface on top of an index that Claude Code already keeps current.

And since Claude Code stores sessions per project (under `~/.claude/projects/<encoded-cwd>/`), `claude --resume <id>` only works from the original project directory. Both surfaces handle that automatically — the picker `cd`s into the right place before spawning `claude`, and the slash command prints the `cd`+resume as one copy-pasteable line.

## Filter reference

| Flag | Effect | Default |
|---|---|---|
| `<query>` (positional) | FTS5 query syntax (phrases `"…"`, prefix `term*`, NEAR, AND/OR/NOT) | optional on TTY (picker opens with the query pre-filled or empty) |
| `-i`, `--interactive` | open the built-in TUI picker | default on a TTY; flag kept for explicit invocation and backward compatibility |
| `-l`, `--list` | force one-shot ranked text output (the pre-default behavior) on a TTY | off; mutually exclusive with `-i` |
| `--regex <pat>` | post-filter results with this regex (Node `RegExp` flavor, `m` flag) | — |
| `--scan` | with `--regex`, skip FTS and full-scan `messages` | off |
| `--include-tools` | also search `tool_use` / `tool_result` rows | off |
| `--only-user` | search only `type='user'` rows | off |
| `--project <substr>` | filter by case-insensitive substring of project name or path | — |
| `--since YYYY-MM-DD` | only messages on or after this date | — |
| `--limit N` | max conversations returned | 20 |
| `--format text\|tsv` | output format | `text` on TTY, `tsv` when piped |
| `--db-path PATH` | override `~/.claude/conversation-search.db` | — |
| `--dangerously-skip-permissions` | arm the picker's Alt+Enter keybinding to resume with `claude --dangerously-skip-permissions` (see "Skip permissions on resume" below) | off |
| `--print-names` | print the picker config (`sessions.json` — names + pins) to stdout and exit | — |
| `--unpin-all` | clear every pinned session (leaves saved names untouched) and exit | — |
| `--no-tmux` | disable the picker's Ctrl-W keybinding even when running inside tmux | — |

`--regex` uses the Node [`RegExp`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/RegExp) flavor compiled with the `m` (multiline) flag. Named groups syntax differs from Python's `re` module (`(?<name>…)` rather than `(?P<name>…)`); other common features (character classes, alternation, anchors, quantifiers, lookaround, backreferences) are the same.

Mutually exclusive flags:

- `--only-user` and `--include-tools` cannot be combined.
- `-i` / `--interactive` and `-l` / `--list` cannot be combined.
- `--regex` without a positional query requires `--scan` — refusing to silently full-scan a 30k+ row table is intentional.

### Dispatch (picker vs one-shot)

On an interactive TTY, `ccsearch` opens the TUI picker by default. Any of these explicitly opts out and uses one-shot ranked text/TSV instead: `--list` / `-l`, `--format=text|tsv`, `--regex`, `--preview`, `--reindex`, `--index-status`, or stdout being redirected/piped. The `-i` flag forces the picker even when those signals would otherwise dispatch to one-shot. Migrating from the previous default: `ccsearch <query> --list` or `ccsearch <query> --format=text` reproduces the old behavior on a TTY.

### Skip permissions on resume (`--dangerously-skip-permissions`)

Pass `--dangerously-skip-permissions` to arm a new picker keybinding: **Alt+Enter** on a selected row resumes the conversation with `claude --dangerously-skip-permissions --resume <id>` — skipping every permission prompt in the resumed session. Plain Enter remains safe; the flag mirrors Claude Code's own `--dangerously-skip-permissions`. When armed, the picker's help line shows a yellow `Alt-Enter dangerous` entry so the armed state is always visible. The flag has no effect on one-shot text output.

**Shift+Enter** is wired as a best-effort secondary binding for the same action. It works on terminals that distinguish Shift+Enter from plain Enter via CSI-u / kitty keyboard protocol — Kitty, WezTerm, iTerm2 with the report-modifiers preference, Windows Terminal with enhanced keyboard. On terminals that send `\r` for both (xterm, GNOME Terminal, macOS Terminal.app default, tmux without passthrough), Shift+Enter is indistinguishable from Enter and falls through to plain resume — no silent injection of the dangerous flag.

Two-layer opt-in: the CLI flag must be set AND the user must press Alt+Enter (not plain Enter). Accidental invocation requires both.

### Rename a session (Ctrl-R)

Press **Ctrl-R** on any picker row to assign a memorable name. The prompt line switches to `rename> <buffer>`; type a name, hit Enter to save, or Esc to cancel. Empty + Enter clears the saved name (reverts to the synthesized title on the next picker open).

Saved names persist in `$XDG_CONFIG_HOME/krmrn42-skills/chat-search/sessions.json` (default `~/.config/...`). The file is human-editable JSON and safe to back up or sync via dotfiles. View it with `ccsearch --print-names`.

On resume, the saved name flows through to `claude --name <name>` so the resumed session opens with the familiar label. This applies to plain resume (Enter), fork (Ctrl-F), and dangerous resume (Alt+Enter) — every resume action threads the name through automatically.

### Pin a session (Ctrl-P)

Press **Ctrl-P** on any picker row to pin it. Pinned rows surface at the top of the list (in pin-order, newest pin first), separated from the rest by a dim `── recent ──` divider (or `── results ──` in FTS mode). Each pinned row shows a `📌` indicator (or `*` with `--no-color`). Pressing Ctrl-P again unpins.

Pin state lives in the same `sessions.json` as saved names. Pinning is global by session id — pins surface regardless of which project you're in. In FTS mode, pinning **does not override the query**: only pins whose content matches the typed query surface; pins that don't match are still hidden.

The `--limit` flag bounds the total visible rows (pinned + non-pinned). If you pin more conversations than the limit, only the newest pins surface. Use `ccsearch --unpin-all` for a quick cleanup.

### Resume with Remote Control (Ctrl-T)

Press **Ctrl-T** on any picker row to launch `claude --remote-control [name] --resume <session-id>` in the conversation's project directory. When the row has a saved name (via Ctrl-R), the name is passed as `--remote-control <name>` — Claude Code's Remote Control consumes that name semantically, so `--name` is deliberately suppressed for this action to avoid double-display.

Ctrl-T has no opt-in flag. If your Remote Control is unconfigured, `claude` will surface that error directly when launched.

### Resume in a new tmux window (Ctrl-W)

When you run the picker inside a tmux session (the picker detects `$TMUX`), pressing **Ctrl-W** spawns `tmux new-window` running `claude --resume <id>` (with `--name` if a saved name exists) in the conversation's project directory. The window's name is the saved name → project name → directory basename, sanitized for tmux's tab bar (control chars stripped, truncated to 40 chars).

The new window receives focus; your previous pane is preserved (`prefix p` to return). Outside tmux, the binding is hidden from the status line and a no-op if pressed. Pass `--no-tmux` to disable the binding even inside tmux (useful for nested tmux, screen-inside-tmux, or IDE-embedded shells that confuse the passthrough).

## Exit codes

| Code | Meaning |
|---|---|
| `0` | success (zero matches is success — empty result, not failure) |
| `1` | user error (bad regex, unparseable date, conflicting flags) |
| `2` | environment error (DB missing, schema drift, Node version too old, no TTY for `-i`) |
| `3` | internal error (uncaught exception, write attempt against read-only DB) |

## TSV columns

For consumers that parse `ccsearch --format=tsv`:

| Col | Field | Notes |
|---|---|---|
| 1 | `session_id` | Full UUID |
| 2 | `project` | Display form (last two path segments, or project_name) |
| 3 | `project_path` | Absolute project path (the `cd` target for resume) |
| 4 | `date` | YYYY-MM-DD of last-activity timestamp |
| 5 | `messages_count` | Integer |
| 6 | `snippet` | Whitespace-collapsed; `<<<` / `>>>` delimit matched spans |
| 7 | `score` | BM25 score (lower is more relevant) |

## Schema-drift detection

At startup `ccsearch` probes `sqlite_master` to verify Claude Code's expected layout (`messages` and `messages_fts` tables, plus the columns the script depends on). If Claude Code is updated and the schema changes, you'll get a clear error like:

```
ccsearch: schema does not match expected layout — missing column(s) in `messages`: project_name.
This usually means Claude Code has been updated and chat-search needs to update too.
File an issue or `git pull` and reinstall.
```

This is intentional — the plugin reads an undocumented internal store, and the only safe response to schema drift is to refuse the query rather than guess.

## Privacy

Reads your local chat database. **Never** writes to `~/.claude/`. Never uploads anything anywhere. Everything stays on your machine. Don't pipe `ccsearch` output into a remote service if your past chats contain anything you don't want to share.

## Self-test

A small fixture-DB-based smoke test ships at `bin/ccsearch.test.sh`:

```bash
bash plugins/chat-search/bin/ccsearch.test.sh
```

It builds a temporary SQLite database matching the live schema, populates a handful of fake conversations across two fake projects, and asserts on row counts and exit codes for several invocations. It does **not** read your real `~/.claude/conversation-search.db`. The test uses the `sqlite3` CLI to build fixtures — that's a developer-only dependency, not a user-runtime one.

CI hookup is deferred — `make lint-skills` does not yet invoke this test.

## Files

```
plugins/chat-search/
├── .claude-plugin/plugin.json
├── README.md (this file)
├── bin/
│   ├── ccsearch                 # the engine — Node, zero external deps
│   ├── picker.js                # built-in TUI picker, required by ccsearch -i
│   └── ccsearch.test.sh         # fixture-DB smoke test
└── commands/
    ├── find.md                  # /chat-search:find slash command
    └── setup.md                 # /chat-search:setup — symlink ccsearch onto your PATH
```

## Slash commands

### `/chat-search:find <query>`

Runs `ccsearch` through the `Bash` tool and renders the top 10 results inline in your Claude Code session. The assistant can read the results and reason about them. Each row in the rendered output includes a copy-pasteable line of the form `(cd <project_path> && claude --resume <session_id>)` — paste that line (or prefix it with `!` to run it in this session's shell) to resume.

```
/chat-search:find session timeout
/chat-search:find "session timeout" --project alpha --since 2025-06-01
/chat-search:find "auth flow" --regex 'TOKEN_[A-F0-9]+'
```

All `ccsearch` flags are forwarded — the slash command is a thin wrapper. Fixed flags: `--format=text --no-color --limit=10`.

**The slash command is text-only by design.** Slash commands run in Claude Code's `Bash` tool, which has no controlling TTY, so the picker cannot run from inside the slash command. For the picker, use the `!` escape from inside a session — it runs in your real terminal:

```
! ccsearch -i regex parse
```

(After running `/chat-search:setup` once, you can also run `ccsearch -i` directly from any shell, without `!`.)

### `/chat-search:setup [target-dir]`

Symlinks the plugin's `bin/ccsearch` into `target-dir` (default `~/.local/bin`) so you can invoke `ccsearch` from any shell. Idempotent — safe to re-run. Checks whether the target dir is on your PATH and prints the appropriate shell-rc export line if not. **Never edits your shell-rc files.**

```
/chat-search:setup            # symlinks into ~/.local/bin
/chat-search:setup ~/bin      # symlinks into ~/bin
```

## FAQ

**Q: Can I just `grep -r ~/.claude/projects/` instead?**
Yes. It works. But: no ranking, no per-conversation aggregation, raw JSONL output, and it scans the full text of every session every time including thousands of `tool_result` rows. `ccsearch` is faster and prettier; `grep` is fine if you don't have this plugin installed. Use whichever you prefer.

**Q: Does this work on Windows?**
Untested. The CLI itself should run anywhere Node 22.5+ does; the picker uses Node's `setRawMode` + ANSI rendering which works on Windows Terminal in PowerShell and Git Bash. The default DB path (`~/.claude/conversation-search.db`) and `claude --resume` invocation may need adjusting. Use `--db-path` to point elsewhere if needed.

**Q: Does this index my JSONL files?**
Yes — we maintain our own FTS5 index built from your JSONL files. On every `ccsearch` startup we do an incremental refresh (only files whose mtime changed get re-parsed). The index lives at `$XDG_DATA_HOME/krmrn42-skills/chat-search/index.db`. Use `ccsearch --reindex` to force a full rebuild or `ccsearch --index-status` to inspect what's indexed.

Earlier versions of this plugin read Claude Code's own `~/.claude/conversation-search.db` directly. We moved away from that because Claude Code's own index has been observed to fall significantly behind disk reality — sometimes by many months — and the plugin's value was bounded by whatever that index happened to know. The self-maintained index gives you a search that matches what's actually on disk.

**Q: My `~/.claude/conversation-search.db` doesn't exist.**
That's fine. The plugin no longer reads it by default. We read JSONL files from `~/.claude/projects/` instead. If you do have a `~/.claude/conversation-search.db` you want to query, pass `--db-path ~/.claude/conversation-search.db`.

**Q: I have Node, but `ccsearch` says it's too old.**
Node 22.5+ is required because `node:sqlite` was added in 22.5. Use `nvm install --lts` to get a current LTS (22.x or 24.x). Ubuntu's `apt` Node packages are often too old; consider `nodesource` or `nvm`.

**Q: I installed Claude Code via the native installer (`curl ... | bash`), so I don't have Node.**
That's correct — the native installer ships a static `claude` binary that doesn't need Node. You'll need to install Node separately for this plugin. Or use the `npm install -g @anthropic-ai/claude-code` install method, which requires Node 18+.
