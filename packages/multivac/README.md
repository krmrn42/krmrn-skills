# multivac

Cross-project full-text search across local Claude Code conversations — bundled-dependencies Node CLI (single file at install time), plus a one-shot `multivac init` that installs the matching Claude Code plugin (`chat-search`).

The CLI maintains its own SQLite FTS5 index built from `~/.claude/projects/**/*.jsonl` and exposes a relevance-ranked search over message bodies across all your projects. With no arguments on a TTY it opens a built-in TUI picker; with a query and `--list`/`--format` it prints results for piping; with `--reindex` it rebuilds.

## Requirements

- **Node ≥ 22.5** — uses the built-in [`node:sqlite`](https://nodejs.org/api/sqlite.html) module. No `npm install` happens at runtime; no Python, no `fzf`, no native compilation.

## Install

### One-shot, no install (`npx`)

```sh
npx -y @krmrn42/multivac --help
npx -y @krmrn42/multivac "the chat where I figured out OAuth"
```

The first invocation takes a few seconds while npm fetches the package; subsequent runs hit the cache.

### Persistent install (`npm`)

```sh
npm install -g @krmrn42/multivac
multivac --help
```

### Bundling the Claude Code plugin

If you also want the slash commands (`/chat-search:find`, `/chat-search:setup`) and the inline-rendering experience inside Claude Code:

```sh
multivac init
```

This shells out to `claude plugin marketplace add krmrn42/krmrn-skills` and `claude plugin install chat-search@krmrn-skills` (the Claude Code CLI's `plugin` subcommand). If the `claude` CLI is not on your `$PATH`, `multivac init` instead prints the equivalent slash commands for you to paste into a Claude Code session manually.

`multivac init` does not modify any shell-rc file or `~/.claude/`-internal config directly — all writes happen through `claude` itself.

## Quick usage

```sh
multivac                      # TTY: open the TUI picker; non-TTY: print --help
multivac "OAuth flow"         # ranked text results
multivac "OAuth flow" --list  # one-shot list mode (no picker)
multivac --format tsv foo     # machine-readable TSV for piping
multivac --reindex            # force full rebuild of the FTS5 index
multivac --index-status       # DB path, size, message/conv count, last refresh
multivac -- init              # search for the literal word "init" (init is a reserved subcommand)
```

See `multivac --help` for the full flag set (filters, regex mode, projects, since-date, limit, picker keybindings, exit codes).

## Where state lives

| Path | What |
|---|---|
| `$XDG_DATA_HOME/krmrn42-skills/chat-search/index.db` (default `~/.local/share/...`) | FTS5 index (rebuildable) |
| `$XDG_CONFIG_HOME/krmrn42-skills/chat-search/sessions.json` | Saved names + pins (persistent) |
| `~/.claude/projects/**/*.jsonl` | Source of truth — read, never written |

## Full user guide

The picker keybindings (Enter resume, Ctrl-F fork, Ctrl-R rename, Ctrl-P pin, Ctrl-T remote-control, Ctrl-W tmux-window, Alt-Enter dangerous-when-armed, `?` help overlay), one-shot mode, exit codes, and indexer maintenance are documented in the companion plugin's MANUAL:

→ [github.com/krmrn42/krmrn-skills/blob/main/plugins/chat-search/MANUAL.md](https://github.com/krmrn42/krmrn-skills/blob/main/plugins/chat-search/MANUAL.md)

## Relationship to the Claude Code plugin

The npm package and the marketplace plugin ship the **same CLI** from the same source tree (`packages/multivac/src/` is the canonical sources; the plugin's `bin/` is a thin symlink). Versions are kept in lockstep — npm `@krmrn42/multivac@X.Y.Z` and plugin `chat-search@X.Y.Z` always carry the same code.

Choose whichever distribution channel suits your environment:

| Channel | Command |
|---|---|
| npm one-shot | `npx -y @krmrn42/multivac …` |
| npm global install | `npm install -g @krmrn42/multivac` |
| Claude Code plugin | `/plugin install chat-search@krmrn-skills` (or `multivac init`) |

## License

[MIT](./LICENSE) © 2026 Shavkat Aynurin and krmrn-skills contributors.

## Issues, contributing

Issues, PRs, and discussions at [github.com/krmrn42/krmrn-skills](https://github.com/krmrn42/krmrn-skills). See [CONTRIBUTING.md](https://github.com/krmrn42/krmrn-skills/blob/main/CONTRIBUTING.md) for the contribution bar.
