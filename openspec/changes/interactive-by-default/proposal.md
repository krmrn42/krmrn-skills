## Why

`ccsearch` already ships an interactive TUI picker (`-i`), and for a human sitting at a terminal it is the better surface in nearly every case — typed-as-you-go query refinement, preview pane, one-keystroke resume/fork, no need to remember flags. The current default is to error out with `"no query provided"` on a bare `ccsearch` invocation and to print a static ranked list when given a query. That makes the better mode an opt-in flag most users never discover; it also makes `ccsearch` the only command in the project where the cheapest "what's in here?" gesture (just type the name) fails. We flip the default for interactive terminals while preserving every existing pipe/script use case unchanged.

## What Changes

- **BREAKING** (UX, not API): on an interactive stdout TTY, `ccsearch` and `ccsearch <query>` now open the TUI picker by default. Today they print "no query provided" / a static ranked text list respectively.
- Non-TTY invocations (`ccsearch foo | head`, redirected stdout, no TTY) keep the current one-shot rendering — `text` if a TTY existed, `tsv` when piped, exactly as today. No script breakage.
- Several flags act as explicit "non-interactive intent" signals and keep one-shot mode active even on a TTY: `--format=text|tsv`, `--list` (new flag, see below), `--regex` (the TUI does not consume it), `--preview`, `--reindex`, `--index-status`. The slash command `/chat-search:find` passes `--format=text` and therefore is unaffected.
- New flag `--list` (alias `-l`): explicit opt-out for users on a TTY who want the static ranked output without having to set `--format`. Exists for discoverability and to give the README a clean way to describe the opt-out.
- `-i` / `--interactive` is kept and becomes a no-op alias (still selects the TUI explicitly). Scripts that pass `-i` continue to work; the flag's help entry is updated to "default on a TTY; flag retained for explicit invocation and backward compatibility."
- Bare `ccsearch` (no query) on a TTY no longer errors. It opens the TUI with an empty query, identical to today's `ccsearch -i`.
- The TTY check moves from inside the picker (`picker.js`) up to the dispatch point in `bin/ccsearch`. The picker's existing `EXIT_ENV` guard remains as a belt-and-braces check but should no longer be reachable for the default path.
- README updates: the "Modes" section is rewritten to lead with the default (TUI), with the one-shot mode and `--list` opt-out described below it.

## Capabilities

### New Capabilities

- `ccsearch-default-mode`: Defines the dispatch rule for which surface (`TUI picker` vs `one-shot ranked output`) `ccsearch` selects when invoked, given the combination of stdout TTY-ness, `-i` / `--interactive`, `--list` / `-l`, `--format`, `--regex`, and the special short-circuit modes (`--preview`, `--reindex`, `--index-status`). Also defines how each existing flag's help entry reflects the new defaults.

### Modified Capabilities

<!-- None. `openspec/specs/` is currently empty. -->

## Impact

- **Code**: `plugins/chat-search/bin/ccsearch` — `main()` dispatch logic and `parseArgs` (new `--list`/`-l` case; `--interactive` becomes alias semantically). Help text (`buildHelp()` — touched by the parallel `improve-ccsearch-help` change; coordination noted in design.md). `plugins/chat-search/bin/picker.js` is unchanged behaviorally; only its TTY guard becomes belt-and-braces.
- **Tests**: `plugins/chat-search/bin/ccsearch.test.sh` — new assertions for TTY/non-TTY dispatch (forced via redirecting stdout to a pipe; testing the actual TTY path is best-effort since the harness has no `script(1)` available by default — see design).
- **Docs**: `plugins/chat-search/README.md` — "Modes" section rewrite; flag reference table updated entries for `-i` and the new `--list`.
- **Slash command**: `plugins/chat-search/commands/find.md` is **unaffected** — it already passes `--format=text --no-color --limit=10`, which falls into the non-interactive branch by design.
- **Users**: Old behavior is reachable via `ccsearch --list <query>`, `ccsearch --format=text <query>`, or by piping (`ccsearch <query> | cat`). Documented in the changed flag entries and the README.
- **Risk**: Medium. The dispatch rule has several inputs and a wrong branching decision (e.g., opening the TUI when stdin is not a TTY but stdout is) would either error or hang. Tests cover the matrix; the picker's internal TTY guard remains as a safety net.
- **Migration**: No data migration. Users who scripted around the old default with `-i` are unaffected (still works). Users who scripted bare `ccsearch <query>` expecting text on a TTY need `--list` or `--format=text` — called out as a deprecation/migration note in the README.
