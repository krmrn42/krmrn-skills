## 1. Config-file infrastructure

- [ ] 1.1 In `plugins/chat-search/bin/ccsearch`, add `sessionsConfigPath()` (mirroring `defaultIndexPath` shape): returns `$XDG_CONFIG_HOME/krmrn42-skills/chat-search/sessions.json` with `~/.config/...` fallback.
- [ ] 1.2 Add `loadSessionStore()`: reads the file, parses JSON, returns `{ version: 1, names: {}, pins: [] }` on missing-file or parse-error; emits a stderr warning on parse-error.
- [ ] 1.3 Add `saveSessionStore(store)`: serializes JSON (indent: 2), writes to `<path>.tmp`, then `fs.renameSync` to the canonical path. Ensures the parent directory exists (`mkdirSync(..., { recursive: true })`).

## 2. Parser + recent-browse integration

- [ ] 2.1 Add `case "--print-names":` branch in `parseArgs` setting `args.printNames = true`. Add default `args.printNames = false`. Handle in `main()` before any DB work: print the file contents (or `{}`) and exit `EXIT_OK`.
- [ ] 2.2 In `recentConversations`, load the session store at the start. For each result row, if `store.names[r.sessionId]` exists, set `r.title = store.names[r.sessionId]` BEFORE the synthesized-title flow would set it. Preserve current synthesized-title behavior for rows without a saved name.
- [ ] 2.3 Add OPTIONS table entry for `--print-names`: `flags: ["--print-names"]`, group: "Index management" (closest fit), description: "Print the session-name config file to stdout and exit. Read-only."
- [ ] 2.4 Export `loadSessionStore`, `saveSessionStore`, `sessionsConfigPath` via the `CCSEARCH_TEST` guard.

## 3. Picker rename-input mode

- [ ] 3.1 In `bin/picker.js`, add `let mode = "browse";` and `let renameBuffer = "";` to the picker state block.
- [ ] 3.2 In `onKeypress`, add a top-level switch on `mode`. When `mode === "rename"`: Enter commits, Esc cancels, Ctrl+C exits, Ctrl+U clears buffer, Backspace pops, printable chars append.
- [ ] 3.3 Ctrl+R in browse mode (with a selected row): set `mode = "rename"`, pre-fill `renameBuffer` with `(r.title || "")`, re-render.
- [ ] 3.4 On Enter commit: call `deps.saveSessionStore` with the updated `names` map (delete the key if `renameBuffer.trim() === ""`); update the current `results[cursor].title` in-memory; set `mode = "browse"`; re-render. Errors from save bubble up as a one-line stderr warning on next render-cycle.
- [ ] 3.5 In `render`, when `mode === "rename"`, replace the top prompt line with `rename> <renameBuffer>` in cyan; dim the result list (apply `ANSI_DIM` to every row's render output instead of the current style).
- [ ] 3.6 Pass `saveSessionStore` and `loadSessionStore` to the picker via `deps`.

## 4. spawnClaude — pass --name when set

- [ ] 4.1 In `bin/picker.js`'s `spawnClaude`, before constructing `claudeArgs`, look up `deps.sessionStore.names[row.sessionId]` (the in-memory snapshot loaded at picker startup, plus any in-session renames). If present, prepend `["--name", name]` to the appropriate position in the argv for each of: `"resume"`, `"resume-dangerous"`, `"fork"`.
- [ ] 4.2 Position rule: `--name` comes BEFORE `--resume <id>` and AFTER `--dangerously-skip-permissions` / `--fork-session`. Confirmed by reading `claude --help` (no order requirement, but this grouping reads naturally).

## 5. Tests

- [ ] 5.1 Add a test that creates a temp `XDG_CONFIG_HOME`, writes a `sessions.json` with `{"version":1,"names":{"conv-A":"my chat"},"pins":[]}`, then exercises `recentConversations` via the `CCSEARCH_TEST` export against a fixture DB. Assert the row for conv-A has `title === "my chat"`.
- [ ] 5.2 Add a test for `--print-names`: prepares a temp config, runs `ccsearch --print-names` with `XDG_CONFIG_HOME` set, asserts stdout matches the file content; runs again with the file removed and asserts stdout is `{}`.
- [ ] 5.3 Add a `loadSessionStore` unit test: corrupt JSON → returns the empty default + warns on stderr.
- [ ] 5.4 Add a `saveSessionStore` unit test: writes, then `ls` confirms no `.tmp` left behind; verifies the file content round-trips through `loadSessionStore`.

## 6. Manual verification

- [ ] 6.1 🚧 NOT VERIFIED (requires real terminal): Ctrl+R on a row, type a name, Enter — name appears on next picker open and is visible in `~/.config/krmrn42-skills/chat-search/sessions.json`.
- [ ] 6.2 🚧 NOT VERIFIED (requires real terminal): rename + Enter, then Enter to resume — confirm `claude --name <name> --resume <id>` was the spawn (visible via `ps` or by checking the resumed session's prompt-box title).
- [ ] 6.3 🚧 NOT VERIFIED (requires real terminal): Esc during rename cancels without writing the file.
- [ ] 6.4 🚧 NOT VERIFIED (requires real terminal): empty + Enter clears the saved name; row reverts to synthesized title on next open.

## 7. Docs

- [ ] 7.1 Update `plugins/chat-search/README.md`: add Ctrl+R to the picker keybindings list; describe `sessions.json` location.
- [ ] 7.2 Add `--print-names` to the flag reference table.
- [ ] 7.3 Run `make lint-skills` from the repo root.
