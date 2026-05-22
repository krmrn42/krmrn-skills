---
description: Search past Claude Code conversations across all projects and surface ranked results inline.
argument-hint: "<query> [flags]"
---

Search the user's past Claude Code conversations using the `multivac` engine bundled with this plugin, and render the ranked results inline.

The plugin's `bin/` directory is automatically added to the `Bash` tool's `PATH` while the plugin is enabled, so `multivac` is callable by bare name. Invoke it via the `Bash` tool with the user's arguments and the fixed flags `--format=text --no-color --limit=10`:

```bash
multivac $ARGUMENTS --format=text --no-color --limit=10
```

`$ARGUMENTS` is forwarded verbatim, so any of `multivac`'s flags (`--project`, `--since`, `--regex`, `--include-tools`, etc.) can be passed by the user inline:

- `/chat-search:find session timeout`
- `/chat-search:find "session timeout" --project alpha --since 2025-06-01`
- `/chat-search:find "auth flow" --regex 'TOKEN_[A-F0-9]+'`

If — and only if — the bare-name invocation returns `multivac: command not found` (a sign the plugin's `bin/` PATH integration is broken), fall back to `${CLAUDE_PLUGIN_ROOT}/bin/multivac` with the same arguments AND surface a one-line note to the user explaining the PATH integration appears broken so they can file an issue. Do **not** try `${CLAUDE_PLUGIN_ROOT}/bin/multivac` first as a precaution — the bare name is the documented path.

## How to render the result

`multivac` text output is already formatted with a per-result resume one-liner of the form `(cd <project_path> && claude --resume <session_id>)`. Show the output verbatim — that one-liner per result is the copy-paste handoff to the user.

- **Exit 0 with rows:** show the output verbatim. The per-row resume line is already pastable; the user can either paste it directly into a shell, or type `! <that line>` from inside Claude Code to run it from this session's shell. Do **not** invoke `claude --resume` from within this slash command — slash commands run in the `Bash` tool with no controlling TTY, so spawning a new interactive Claude Code session from inside is not supported.
- **Exit 0 with `no matches`:** report that briefly and suggest broadening the search (drop a filter, simplify the FTS query, try `--include-tools` if the term might appear in tool output).
- **Exit 1:** the user made a mistake (bad regex, unparseable date, conflicting flags). Surface the error verbatim and explain how to fix.
- **Exit 2:** environment problem. The most common cases are:
  - No past conversations on disk yet (`~/.claude/projects/` is empty) — tell the user to use Claude Code at least once.
  - Node.js is older than 22.5 or missing — surface the version-check error verbatim; it contains per-OS install commands.
  - Schema drift after a plugin upgrade — surface verbatim and recommend `multivac --reindex` to rebuild the index.
- **Exit 3:** internal error. Surface verbatim and recommend filing an issue against the plugin.

## When to point at `multivac -i` instead

This slash command renders text. It cannot host a TTY-based picker because slash commands run in Claude Code's `Bash` tool, which has no controlling TTY. The picker uses Node's TTY primitives and has **no external dependency** (no `fzf` required).

If the user's intent looks like browsing rather than precise lookup — for example, the query returns more than 10 results, or the user says they want to "scroll through" or "look around" — recommend the interactive surface:

> "If you want to scroll through more candidates with a live preview pane, run `! multivac -i $ARGUMENTS` from the prompt — that opens the built-in TUI picker in your real terminal where you can pick a chat with Enter (which lands you in the right project directory automatically)."

Do **not** try to invoke the picker from this slash command, and do **not** mention `fzf` — the picker has no such dependency.

If the user asks how to make `multivac` callable from their own shell (outside Claude Code), point them at `/chat-search:setup` — it's a one-shot helper that symlinks `bin/multivac` into `~/.local/bin` and tells them whether their PATH needs an export line.
