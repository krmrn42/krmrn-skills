## Why

Synthesized titles (`browse-recent-on-empty-query`) get conversations to ~80% recognizable, but the residual 20% need human judgment: "the one where I debugged the migration", "the auth-rewrite that's stalled on legal review", etc. Claude Code already supports `claude -n, --name <name>` ("Set a display name for this session (shown in the prompt box, /resume picker, and terminal title)"), so the destination behavior already exists upstream — we just need a picker affordance to (a) collect a name from the user, (b) remember it locally per session id, and (c) thread it through to `claude` on resume.

This also unlocks downstream features: tmux-new-window can use the chosen name as the window title (`picker-tmux-new-window`), and the status bar shows the chosen name on subsequent picker opens (`picker-status-bar`).

## What Changes

- New picker keybinding **Ctrl+R** ("rename") on a selected row: opens an inline single-line input where the user types a name and presses Enter (or Esc to cancel). The current synthesized title or any prior name is pre-filled as the starting value.
- Name persisted to `$XDG_CONFIG_HOME/krmrn42-skills/chat-search/sessions.json` (default `~/.config/krmrn42-skills/chat-search/sessions.json`). File schema is a single JSON object: `{ "names": { "<session-id>": "<name>" }, "pins": [...] }` — the `pins` key is reserved here for the parallel `picker-pin-sessions` change; this change only writes to `names`. Atomic-write semantics: write to `sessions.json.tmp`, then `rename`.
- Recent-browse rendering: if a session has a name in `sessions.json`, the picker shows that name on line 1 instead of the synthesized title. The metadata suffix (`· proj · date · N msgs · short-id`) is unchanged.
- Resume actions (plain Enter, Alt+Enter for dangerous resume, and the future `picker-remote-control-launch` / `picker-tmux-new-window` actions) all pass `--name <name>` to `claude` when a name exists for the row.
- Empty name (user backspaces everything and presses Enter inside the rename prompt) clears the saved name — the row reverts to its synthesized title.
- New CLI flag `--print-names` for shell-tooling integration: prints `sessions.json` to stdout and exits. Read-only — does not modify the file. (Tiny addition; lets users `jq` over their names.)
- Help/`--help` entries: add a new line entry for `--print-names` and a new `Picker keybindings:` block in the help epilog mentioning Ctrl+R.

## Capabilities

### New Capabilities

- `ccsearch-session-rename`: Defines the rename keybinding, the on-disk format and location of `sessions.json`, the resume-time passthrough to `claude --name`, the display-precedence rule (saved name > synthesized title), and the `--print-names` CLI surface.

### Modified Capabilities

- `ccsearch-recent-browse`: Modify the "Each recent row shows a synthesized title plus tail snippet" requirement so the line-1 lead is the saved name when present, falling back to the synthesized title otherwise.

## Impact

- **Code**: `plugins/chat-search/bin/ccsearch` — new `sessionStore` helpers (load / save / atomic-rename); `recentConversations` joins the name map; new `--print-names` flag in parser + OPTIONS table. `plugins/chat-search/bin/picker.js` — new Ctrl+R branch + inline-input mode (modal: takes over the prompt line while open); `spawnClaude` argv gets `--name <name>` prepended when a name exists.
- **Schema**: No DB schema change. The new `sessions.json` is config (not data); the DB index remains the source of truth for messages.
- **Tests**: `bin/ccsearch.test.sh` — new fixture writes a tiny `sessions.json` under `$XDG_CONFIG_HOME`; assert recentConversations returns the saved name in the `title` field; assert `--print-names` round-trips the file; assert atomic-write doesn't leave `.tmp` debris on failure.
- **Docs**: `plugins/chat-search/README.md` — describe `sessions.json` location and format; add Ctrl+R to the picker keybindings list. (Will be folded into the upcoming `ccsearch-user-manual` too.)
- **Users**: Zero impact until the user presses Ctrl+R. Names persist per-machine in the config directory.
- **Risk**: Low. The inline-input mode is the most novel piece — it must intercept normal keystrokes (typed characters extend the name, Enter commits, Esc cancels) and restore the picker's previous state on exit. Tested manually.
