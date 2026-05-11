## Context

`claude -n, --name <name>` is already a first-class Claude Code flag. `ccsearch`'s picker spawns `claude` directly via `spawnSync` in `bin/picker.js`'s `spawnClaude`. So the integration point is straightforward: when the user has assigned a name to a session id, prepend `["--name", name]` to the spawn argv. The work is in the local-storage layer and the inline-input UI.

Recent-browse already synthesizes a title from the first non-wrapper user message (`bin/ccsearch:recentConversations`). The display rule becomes: saved-name (if any) > synthesized-title (current behavior) > metadata-only fallback (no usable user message at all).

## Goals / Non-Goals

**Goals:**

- Press Ctrl+R, type a name, see it stick across picker invocations and propagate to `claude --name` on resume.
- Persistent storage is a single JSON file the user can edit or back up by hand.
- All resume actions (plain, dangerous, future remote-control, future tmux-new-window) honor the saved name.

**Non-Goals:**

- Syncing names across machines. The file is per-machine; users with multi-machine workflows can sync it themselves (e.g., via dotfiles).
- Per-project name namespacing. Names are keyed on session id, which is globally unique; no need to scope by project.
- Round-tripping the name back into the JSONL or the Claude Code session-search DB. The name lives in `sessions.json` only; Claude Code's own naming UI (if any future version adds one) is orthogonal.
- A rename-on-resume confirmation. The user gets to back out via Esc.

## Decisions

### Decision 1: One config file, atomic write, JSON

Location: `$XDG_CONFIG_HOME/krmrn42-skills/chat-search/sessions.json`, with `~/.config` as the XDG fallback. Schema:

```json
{
  "version": 1,
  "names": { "<session-id>": "<name>" },
  "pins":  [ "<session-id>", ... ]
}
```

The `version` field exists for future migrations. The `pins` key is reserved for the parallel `picker-pin-sessions` change; this change writes only `names`. Atomic write: serialize → write to `sessions.json.tmp` → `fs.renameSync` → if any step fails, the previous file remains intact.

**Alternative considered: SQLite (reuse the index DB).** Rejected. Adds a write-path against the index DB which is otherwise read-only-from-the-picker's-perspective. JSON is human-editable, dotfile-syncable, and trivial to inspect.

### Decision 2: Inline-input modal, query box gets repurposed

Pressing Ctrl+R puts the picker into a "rename-input" sub-mode. The prompt-line UI changes:

- Top line normally reads `ccsearch> <query>`. In rename mode it reads `rename> <name>` in a different color (cyan) with a cursor.
- The result list dims (rendered with `ANSI_DIM` only) to signal it's not the active focus.
- Keystrokes that normally modify the query (printable chars, Backspace, Ctrl+U) instead modify the rename buffer.
- Enter commits the rename: write to sessions.json, update the in-memory result row's `title` field, return to picker mode with the modified row still selected.
- Esc cancels: discard the buffer, return to picker mode unchanged.
- Empty + Enter clears the saved name (deletes the key from `names`).

This is the smallest UI footprint that doesn't require a separate render path for the result list.

**Alternative considered: a separate alt-screen overlay or popup**. Rejected — the picker already uses the alt-screen and adding a nested overlay would complicate the render math significantly.

### Decision 3: Sort precedence — saved-name does NOT change ordering

Recent-browse is ordered by most-recent activity. Renaming a session does **not** bubble it to the top. This keeps "recency" as the dominant ordering axis. Pinning (`picker-pin-sessions`) is the dedicated mechanism for promoting a row.

### Decision 4: Display precedence — saved-name wins over synthesized title

`buildResultLine` in `picker.js` already prefers `r.title` for line 1. We pre-populate `r.title` from `sessions.json` when present, **before** the synthesized title is computed; if no saved name exists, the existing synthesized-title flow runs unchanged. This keeps the picker render path agnostic to which kind of title it's displaying.

### Decision 5: `--print-names` is a tiny escape hatch

A read-only flag that prints `sessions.json` to stdout and exits 0. Useful for shell tooling (`ccsearch --print-names | jq '.names'`) and for backup scripts. No write side. If `sessions.json` does not exist, prints `{}` (valid empty JSON) and exits 0.

## Risks / Trade-offs

- **Risk: stale entries.** If a user deletes a conversation's JSONL, the entry in `sessions.json` still references its session id and the row no longer appears in recent-browse. The entry is dead weight but harmless. We don't garbage-collect; the file is unbounded but realistically caps at hundreds of entries even for heavy users.
- **Risk: concurrent rename.** Two picker invocations running in parallel could race on the atomic write. The losing writer overwrites the winner's change. We accept this — multi-instance picker is rare, and last-write-wins is the right model for a user-facing rename.
- **Risk: `--name`'s downstream effect changes in a future Claude Code version.** Mitigation: the flag is documented in current `claude --help`; behavior changes will surface as upstream changes, not silent breakage here.
- **Trade-off: inline-input mode adds picker-state complexity.** Worth it — popup overlays would be worse. We isolate the mode with a single `mode = "browse" | "rename"` variable and route keystrokes via a top-level switch in `onKeypress`.
