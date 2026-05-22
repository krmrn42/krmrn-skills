# multivac User Manual

`multivac` is a relevance-ranked full-text search across local Claude Code conversations, with a built-in TUI picker, a slash command, and a one-shot pipe-friendly mode. This manual is the workflow-oriented walkthrough: start here when you've installed the plugin and want to learn what's possible. For the canonical flag reference, run `multivac --help`; for formal requirements, see `openspec/specs/`.

**Contents**

1. [Quick start](#quick-start)
2. [The picker](#the-picker)
3. [Picker actions](#picker-actions)
4. [Mutation actions](#mutation-actions)
5. [One-shot mode](#one-shot-mode)
6. [The slash command](#the-slash-command)
7. [The index](#the-index)
8. [Flag reference](#flag-reference)
9. [Troubleshooting](#troubleshooting)
10. [How it's distributed](#how-its-distributed)
11. [Compatibility](#compatibility)
12. [Origins](#origins)

---

## Quick start

Install the marketplace and the plugin:

```
/plugin marketplace add krmrn42/krmrn-skills
/plugin install chat-search@krmrn-skills
```

Inside Claude Code, the bundled `multivac` binary is already on PATH. From your own shell, run once: `/chat-search:setup` to symlink `bin/multivac` into `~/.local/bin/multivac`.

Try it:

```bash
multivac                  # open the picker; empty query → recent conversations
multivac "session timeout" # FTS5 query
multivac -i               # force the picker even when piped
```

When you open the picker, you see a prompt line on top, a status bar listing keybindings, and a result list. Up/Down to navigate, Enter to resume the selected conversation (Claude opens in its original project directory), Esc to cancel.

---

## The picker

The picker is the default `multivac` surface on a TTY. The layout:

```
multivac> <query>                          ← prompt line (row 1)
Enter resume   Ctrl-F fork   Ctrl-R …      ← status bar (rows 2-3)
                                           ← blank
  ▌ <title> · <project>  <date>  ...       ← selected row marker
    <last-message snippet>
    <title> · <project>  <date>  ...
    ...                                    ← body (results)
N results                                  ← footer (last row)
```

When the terminal is wide enough (≥ 100 columns) a preview pane appears on the right showing the first 20 messages of the selected conversation.

**Empty query** opens recent-browse: the picker lists your most recent conversations across all projects, each with a synthesized title (the first non-wrapper user message) and the tail of the last message. This makes `multivac` a recognize-and-resume entry point — you don't have to remember keywords from the conversation.

**FTS5 query syntax** (when you type into the prompt):

- Plain terms: `auth flow` — matches conversations containing both words
- Phrases: `"session timeout"` — exact phrase match
- Prefix: `regex*` — matches words starting with `regex`
- Boolean: `auth AND NOT login` — combine with `AND`, `OR`, `NOT`
- Proximity: `NEAR(token cluster, 10)` — words within 10 tokens of each other

Results re-rank live as you type (80ms debounce). FTS5 errors render inline rather than crashing the picker — fix the syntax and keep typing.

**Terminal-size requirements:** the picker needs at least 40 columns × 6 rows. Below that you'll see "terminal too small" — resize and the render recovers.

> spec: `openspec/specs/multivac-default-mode/spec.md`, `openspec/specs/multivac-recent-browse/spec.md`

---

## Picker actions

These actions launch `claude` or print info and exit. Each is a one-keystroke shortcut on the selected row.

### Resume (Enter)

Spawns `claude --resume <session-id>` in the row's project directory. The picker tears down cleanly, your shell sees `claude`'s interactive UI, and when `claude` exits your parent shell is back where you were. If the row has a saved name (Ctrl-R), `--name <name>` is also threaded through so the resumed session opens with the familiar label.

### Dangerous resume (Alt-Enter / Shift-Enter)

When the picker is launched with `--dangerously-skip-permissions`, Alt-Enter resumes with `claude --dangerously-skip-permissions --resume <id>` — skipping every permission prompt in the resumed session. Plain Enter remains safe; the dangerous binding is armed only by the CLI flag, and Alt-Enter (not Enter) is the keystroke — two-layer opt-in by design.

Shift-Enter is wired as a best-effort alias for the same action. It works on terminals that distinguish Shift-Enter from Enter via CSI-u / kitty keyboard protocol: Kitty, WezTerm, iTerm2 with report-modifiers, Windows Terminal with enhanced keyboard. On terminals that send `\r` for both, Shift-Enter behaves as plain Enter (falls through to safe resume — no silent escalation).

> spec: `openspec/specs/multivac-dangerous-resume/spec.md`

### Remote-control (Ctrl-T)

Spawns `claude --remote-control [name] --resume <id>` in the row's project directory. If the row has a saved name, the name is passed as `--remote-control <name>` — Claude Code's Remote Control consumes that name semantically, and `--name` is deliberately suppressed for this action to avoid double-display.

Ctrl-T has no opt-in flag. If Remote Control is unconfigured on your system, `claude` surfaces that error directly when launched — multivac doesn't try to second-guess.

> spec: `openspec/specs/multivac-remote-control-resume/spec.md`

### Tmux new-window (Ctrl-W)

When the picker is running inside tmux (the `$TMUX` env var is set), Ctrl-W spawns `tmux new-window` running the resumed claude command in the conversation's project directory. The window's name is derived from saved name → project name → directory basename → `claude` (defensive fallback), sanitized for tmux's tab bar (control chars stripped, 40-character cap with ellipsis).

The new window receives focus; your previous pane is preserved and reachable via `prefix p` or `prefix <number>`. Outside tmux, the binding is hidden from the status bar and a no-op if somehow pressed.

Pass `--no-tmux` to disable the binding even inside tmux — useful for nested tmux, screen-inside-tmux, or IDE-embedded shells where the passthrough misbehaves.

> spec: `openspec/specs/multivac-tmux-window-launch/spec.md`

### Fork (Ctrl-F)

Spawns `claude --fork-session --resume <id>` to create a new session id branching from the selected one. Useful when you want to revisit an old conversation as a starting point without overwriting its history. The new session inherits the saved name if there is one.

---

## Mutation actions

These actions modify `sessions.json` (the picker's per-session config under `$XDG_CONFIG_HOME/krmrn42-skills/chat-search/`) and re-render the picker.

### Rename (Ctrl-R)

Assigns a memorable name to the selected conversation. The picker enters rename mode: the top line switches to `rename> <buffer>` in cyan, the result list dims, and your keystrokes go to the rename buffer. Enter commits, Esc cancels, empty + Enter clears the saved name (reverts to the synthesized title on the next picker open).

Saved names live in `sessions.json` under the `names` key. The file is human-editable JSON; back it up or sync it via dotfiles. View it with `multivac --print-names`.

On resume (plain Enter, fork, and dangerous resume), the saved name flows through as `claude --name <name>` so the resumed session opens with the label you chose. (Remote-control is the exception — its own positional name argument supersedes `--name`; see the "Remote-control" picker action.)

> spec: `openspec/specs/multivac-session-rename/spec.md`

### Pin (Ctrl-P)

Pins the selected row to the top of the result list. Pinned rows render in pin-order (newest pin first), separated from non-pinned rows by a dim divider — `── recent ──` in empty-query mode, `── results ──` when you're searching. Each pinned row shows `📌` (or `*` with `--no-color`). Pressing Ctrl-P on a pinned row unpins it.

Pin state is global by session id (not per-project), and lives in the same `sessions.json` as saved names. In FTS mode, **pinning does not override the query**: only pins whose content matches your typed query surface; non-matching pins stay hidden. This matches the mental model "show me what I'm looking for, with pinned ones surfacing if they match."

The `--limit` flag bounds the total visible rows (pinned + non-pinned). If pins exceed the limit, only the newest pins surface. Use `multivac --unpin-all` to wipe pins without opening the picker.

> spec: `openspec/specs/multivac-session-pin/spec.md`

### Help overlay (?)

Press `?` when the query is empty to open a help overlay listing every active picker binding with its long-form description. Any key dismisses the overlay and returns to browse mode. The `?` is gated on empty-query so you can still type it as a literal character when searching.

The overlay is per-category styled (the same color scheme as the status bar: resume is default, action is cyan, dangerous is yellow, navigation is dim). Bindings hidden by their visibility predicate (dangerous-resume when not armed; tmux-window outside `$TMUX`) don't appear in the overlay either.

> spec: `openspec/specs/multivac-picker-status-bar/spec.md`

---

## One-shot mode

When stdout is piped, or you pass `--list`, `--format`, `--regex`, `--preview`, `--reindex`, or `--index-status`, `multivac` runs in one-shot mode instead of opening the picker. The default format is `text` on a TTY and `tsv` when piped — override with `--format text|tsv`.

Text output shows ranked rows with a copy-paste resume one-liner per row:

```
multivac "auth flow" --list

  1. alpha  2025-08-12  142 msgs  conv-aaaa
     ... let me work the <<<auth>>> <<<flow>>> step by step ...
     (cd /home/u/projects/alpha && claude --resume conv-aaaa-1111-…)
```

TSV output is one row per result, columns `session_id`, `project`, `project_path`, `date`, `messages_count`, `snippet`, `score`. Useful for shell pipelines:

```bash
# project breakdown of conversations mentioning "deploy"
multivac "deploy" --format tsv --limit 200 | cut -f2 | sort | uniq -c | sort -rn

# pull the top 5 session ids for piping into another tool
multivac "auth" --format tsv | head -5 | cut -f1
```

The `-i` flag forces the picker even when piped (use with `</dev/tty` or in an `tty`-checking wrapper).

---

## The slash command

`/chat-search:find <query>` runs `multivac` inside Claude Code's `Bash` tool and renders the top results inline. Each row carries the same copy-paste resume one-liner you'd see in text mode — paste it (or prefix with `!` to run it in your real shell) to resume.

```
/chat-search:find session timeout
/chat-search:find "session timeout" --project alpha --since 2025-06-01
/chat-search:find "auth flow" --regex 'TOKEN_[A-F0-9]+'
```

The slash command always forces text format with `--no-color` and a `--limit=10` cap. All other multivac flags are forwarded. The picker doesn't run from slash-command context (the Bash tool has no controlling TTY); for the picker, use the `!` escape:

```
! multivac -i regex parse
```

---

## The index

`multivac` maintains its own SQLite FTS5 index at `$XDG_DATA_HOME/krmrn42-skills/chat-search/index.db` (default: `~/.local/share/krmrn42-skills/chat-search/index.db`). The source of truth is `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl`, which Claude Code writes and updates as you have conversations. multivac reads those JSONL files and never modifies them.

**First invocation:** full build. Expect ~30–90 seconds for several hundred sessions.

**Subsequent invocations:** incremental refresh — files whose mtime hasn't changed are skipped. Sub-second on most machines.

**Force a full rebuild:** `multivac --reindex`. Prints a summary (messages, conversations, projects) and exits.

**Inspect the index:** `multivac --index-status` prints the DB path, size, message/conversation count, last-refresh time, and any files pending refresh.

**Wipe and rebuild:** `rm -rf ~/.local/share/krmrn42-skills/chat-search/` then run multivac — it builds from scratch.

The plugin reads (and writes) only its own `index.db` plus `sessions.json` (saved names + pins). It never writes to `~/.claude/`.

---

## Flag reference

For the canonical form, run `multivac --help`. The summary:

| Flag | Effect |
|---|---|
| `-h`, `--help` | Show the full help and exit |
| `-i`, `--interactive` | Force the picker even when other inference would dispatch to one-shot |
| `-l`, `--list` | Force one-shot ranked text output (mutually exclusive with `-i`) |
| `--regex <PAT>` | Post-filter results with this regex (Node `RegExp` flavor, `m` flag) |
| `--scan` | With `--regex` and no positional query, full-scan all messages |
| `--include-tools` | Also search tool-call rows (excluded by default) |
| `--only-user` | Search only user rows |
| `--project <SUBSTR>` | Filter by case-insensitive substring of project name or path |
| `--since YYYY-MM-DD` | Only include messages on or after this date |
| `--limit <N>` | Maximum conversations returned (default: 20) |
| `--format text\|tsv` | Output format (default: text on TTY, tsv when piped) |
| `--no-color` | Disable ANSI color in text output |
| `--db-path <PATH>` | Override the index DB path |
| `--preview <SESSION_ID>` | Render a turn-by-turn preview of the named session and exit |
| `--reindex` | Force full rebuild of the plugin-owned index, then exit |
| `--index-status` | Print index DB path, size, counts, last-refresh time |
| `--dangerously-skip-permissions` | Arm the picker's Alt-Enter binding for dangerous resume |
| `--print-names` | Print the picker config (`sessions.json` — names + pins) to stdout |
| `--unpin-all` | Clear every pinned session; leaves saved names untouched |
| `--no-tmux` | Disable the picker's Ctrl-W binding even inside tmux |

Mutually exclusive: `-i` / `-l`; `--only-user` / `--include-tools`; `--reindex` and `--index-status` can't be combined with `--db-path` / `$CCSEARCH_DB`.

> spec: `openspec/specs/multivac-cli-help/spec.md`

---

## Troubleshooting

**Exit code 1 — user error.** Bad regex, unparseable date, conflicting flags (e.g. `-i` + `-l`). The error message names the specific cause; fix the invocation.

**Exit code 2 — environment error.** Most common causes:

- *DB missing or schema-drifted.* Run `multivac --reindex` to rebuild from disk. If the schema has changed (Claude Code updated under you), check whether the plugin has an update available.
- *Node version too old.* multivac requires Node 22.5+ (uses the built-in `node:sqlite` module). `nvm install --lts` or use your package manager's current LTS.
- *`-i` without a TTY.* The picker needs a real terminal. From CI or a non-interactive shell, use `--list` or `--format text` instead.

**Exit code 3 — internal error.** An uncaught exception or a write attempt against a read-only DB. Re-run with the full error visible (`multivac ... 2>&1 | less`) and file an issue if the cause isn't obvious.

**Picker opens but no results.** Two cases:
- *Fresh index, empty query.* You'll see "no conversations indexed yet". Use Claude Code at least once and re-run multivac — the first invocation builds the index.
- *Query has FTS syntax errors.* The picker shows the FTS error inline rather than crashing. Fix the syntax (most often a stray `*` or unescaped quote) and keep typing.

**`claude --resume` says "session not found".** multivac always launches `claude` in the conversation's original project directory, so this should be rare. If it happens, double-check that `~/.claude/projects/<dir>/<session-id>.jsonl` still exists — if you've moved or deleted the project directory, the session is orphaned.

**`sessions.json` is corrupt.** multivac prints a stderr warning on load and falls back to the empty default. Fix the JSON by hand or delete the file; renames and pins recreate it on the next mutation.

**Ctrl-W does nothing.** You're not inside tmux, or you passed `--no-tmux`. Run `echo $TMUX` to verify.

**Shift-Enter doesn't trigger dangerous resume.** Your terminal sends `\r` for both Enter and Shift-Enter (no CSI-u support). Use Alt-Enter instead — it works on every terminal that distinguishes Alt from no-Alt for Enter.

---

## How it's distributed

The `multivac` CLI ships through **two distribution channels** that carry the same code:

| Channel | Install | When to choose it |
|---|---|---|
| Claude Code marketplace plugin | `/plugin marketplace add krmrn42/krmrn-skills` + `/plugin install chat-search@krmrn-skills` | You live inside Claude Code; want `/chat-search:find` and the auto-PATH integration that comes with plugin install |
| npm scoped package | `npm install -g @krmrn42/multivac` (or `npx -y @krmrn42/multivac`) | You're a shell-first user, or want a one-shot run without installing; you can still bridge to Claude Code via `multivac init` |

The plugin and the npm package always carry the same version string. Inside this monorepo, canonical sources live at `packages/multivac/src/`; the plugin's `bin/` is a thin layer of git-tracked symlinks pointing into the package directory. A linter rule (`marketplace.plugin.package-version-sync`) refuses to ship if `packages/multivac/package.json`, `plugins/chat-search/.claude-plugin/plugin.json`, and the matching `marketplace.json` entry disagree on the version.

**The 0.6.0 rename:** before 0.6.0 the binary was named `ccsearch`. The rename is a hard cut — no `ccsearch` bin alias ships. If you ran `/chat-search:setup` before 0.6.0, re-run it once; the slash command detects the stale `~/.local/bin/ccsearch` symlink (only if it points into the plugin's own `bin/`) and removes it before symlinking the new `multivac`. See [CHANGELOG.md](./CHANGELOG.md) for the full rename note.

---

## Compatibility

**Node.js:** ≥ 22.5 required (`node:sqlite` is built-in starting in 22.5). No `npm install` needed.

**Terminals:** the picker uses Node's `readline` keypress events + raw mode + ANSI rendering. Works on:
- Linux: GNOME Terminal, Konsole, Kitty, Alacritty, WezTerm, xterm, urxvt, st
- macOS: Terminal.app, iTerm2, Kitty, Alacritty, WezTerm
- Windows: Windows Terminal (PowerShell or WSL bash), Git Bash, Cmder
- Multiplexers: tmux, GNU screen, zellij — known good

**Shift-Enter dangerous-resume** requires CSI-u / kitty keyboard protocol passthrough:
- Native CSI-u: Kitty, WezTerm, iTerm2 (with "report modifiers in CSI u" preference), Foot, Ghostty
- Windows Terminal with enhanced keyboard
- Konsole 22.04+
- tmux passes CSI-u when `set -g extended-keys on` is set
- Terminals that send `\r` for both: xterm, urxvt, GNOME Terminal default, macOS Terminal.app, tmux without extended-keys

On those latter terminals, Alt-Enter is the working alternative (no CSI-u required).

**tmux quirks:**
- Nested tmux (tmux inside tmux): `$TMUX` is set; `tmux new-window` operates on the outermost server. Use `--no-tmux` if this confuses you.
- Screen-inside-tmux: works but window-name truncation behavior may surprise — pass `--no-tmux` if the result is unreadable.

**Windows:** the CLI runs (Node 22.5+ available; `node:sqlite` works). Untested in production. The picker should work in Windows Terminal; the `claude --resume` invocation may need adjusting based on how Claude Code is installed on Windows.

---

## Origins

`multivac`'s foundation was shaped in the private companion marketplace [`krmrn42/skills`](https://github.com/krmrn42/skills) before this plugin graduated. The four archived OpenSpec changes that established the architecture:

- [`add-chat-search-plugin`](https://github.com/krmrn42/skills/tree/main/openspec/changes/archive/2026-05-10-add-chat-search-plugin) — the plugin scaffold (plugin.json, README, install path) and the initial picker.
- [`add-chat-search-slash-command`](https://github.com/krmrn42/skills/tree/main/openspec/changes/archive/2026-05-10-add-chat-search-slash-command) — the `/chat-search:find` slash command surface.
- [`chat-search-self-maintained-index`](https://github.com/krmrn42/skills/tree/main/openspec/changes/archive/2026-05-10-chat-search-self-maintained-index) — the plugin-owned FTS5 index built from `~/.claude/projects/**/*.jsonl` (replacing the earlier read of Claude Code's own `~/.claude/conversation-search.db`, which had been observed to fall significantly behind disk reality).
- [`chat-search-zero-deps-and-resume-handoff`](https://github.com/krmrn42/skills/tree/main/openspec/changes/archive/2026-05-10-chat-search-zero-deps-and-resume-handoff) — the zero-npm-dependencies posture (Node 22.5+ with `node:sqlite`) and the cwd-aware resume handoff (the picker always launches `claude` in the conversation's original project directory).

Newer capabilities — recent-browse (empty query), the default-picker behavior, the dangerous-resume opt-in, rename, pin, remote-control, tmux-window, the table-driven status bar — are speced under this repo's `openspec/specs/`.

---

*This manual is part of the `multivac-user-manual` capability. Any change that adds or modifies a picker keybinding, CLI flag, or user-visible behavior should update the corresponding section here in the same change-set — see `openspec/specs/multivac-user-manual/spec.md`.*
