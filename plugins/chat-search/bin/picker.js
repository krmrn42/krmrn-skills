// picker.js — built-in TTY picker for ccsearch.
//
// No external dependencies. Uses Node's readline + raw-mode TTY + ANSI codes.
// Keybindings:
//   ↑/↓   (and Ctrl-K/Ctrl-J) navigate
//   Enter           resume with cwd = result's project_path
//   Ctrl-F          fork (claude --fork-session --resume) with cwd
//   Ctrl-O          print session id and exit
//   Ctrl-D          print project path and exit
//   Esc / Ctrl-C    cancel (exit 0)

"use strict";

const childProc = require("node:child_process");
const readline = require("node:readline");

// --- ANSI helpers (only used while raw-mode is on) -----------------------

const ESC = "\x1b";
const CSI = ESC + "[";

const ansi = {
  altScreenEnter: CSI + "?1049h",
  altScreenExit: CSI + "?1049l",
  hideCursor: CSI + "?25l",
  showCursor: CSI + "?25h",
  clearScreen: CSI + "2J" + CSI + "H",
  clearLine: CSI + "2K",
  moveTo: (row, col) => CSI + row + ";" + col + "H",
  reset: CSI + "0m",
  bold: CSI + "1m",
  dim: CSI + "2m",
  reverse: CSI + "7m",
  fgGreen: CSI + "32m",
  fgYellow: CSI + "33m",
  fgCyan: CSI + "36m",
};

// Strip ANSI from string for visible-length calculations.
function visibleLen(s) {
  let n = 0;
  let inEsc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (inEsc) {
      // CSI sequences end with a letter in the @-~ range
      if (c >= 64 && c <= 126) inEsc = false;
      continue;
    }
    if (c === 0x1b) {
      inEsc = true;
      continue;
    }
    n++;
  }
  return n;
}

function truncateToWidth(s, width) {
  if (visibleLen(s) <= width) return s;
  // Naively: keep characters until we hit width-1, then append ellipsis.
  let out = "";
  let n = 0;
  let inEsc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inEsc) {
      out += c;
      if (c.charCodeAt(0) >= 64 && c.charCodeAt(0) <= 126) inEsc = false;
      continue;
    }
    if (c === ESC) {
      out += c;
      inEsc = true;
      continue;
    }
    if (n + 1 > width - 1) {
      out += "…";
      break;
    }
    out += c;
    n++;
  }
  return out;
}

function wrapToWidth(s, width) {
  // Simple word-wrap that respects newlines. ANSI-naive (the preview content is
  // plain text), so we don't need to handle escape sequences here.
  const lines = [];
  for (const para of s.split("\n")) {
    if (para === "") {
      lines.push("");
      continue;
    }
    let cur = "";
    for (const word of para.split(/(\s+)/)) {
      if (visibleLen(cur) + visibleLen(word) > width) {
        if (cur) lines.push(cur);
        cur = word.replace(/^\s+/, "");
      } else {
        cur += word;
      }
    }
    if (cur) lines.push(cur);
  }
  return lines;
}

// --- Claude argv builder -------------------------------------------------

// buildClaudeArgs is the single source of truth for the argv passed to
// `claude` when the picker spawns it. Action-aware: savedName lands in
// different positions depending on `action`. A naive "if savedName, prepend
// --name" helper would produce the wrong shape for resume-remote-control,
// which consumes the name via its own positional argument.
//
// Actions:
//   - "resume"               → ["--resume", id] (+ --name when set)
//   - "fork"                 → ["--fork-session", "--resume", id] (+ --name)
//   - "resume-dangerous"     → ["--dangerously-skip-permissions", "--resume", id] (+ --name)
//   - "resume-remote-control"→ ["--remote-control", name?, "--resume", id]  (NO --name)
function buildClaudeArgs(action, row, savedName) {
  const id = row.sessionId;
  const name = typeof savedName === "string" && savedName.length > 0 ? savedName : null;
  if (action === "resume-remote-control") {
    // --remote-control consumes the name semantically; --name is suppressed.
    return name
      ? ["--remote-control", name, "--resume", id]
      : ["--remote-control", "--resume", id];
  }
  const namePart = name ? ["--name", name] : [];
  if (action === "fork") return ["--fork-session", ...namePart, "--resume", id];
  if (action === "resume-dangerous") {
    return ["--dangerously-skip-permissions", ...namePart, "--resume", id];
  }
  // Default action: plain "resume".
  return [...namePart, "--resume", id];
}

// --- Picker --------------------------------------------------------------

function runPicker(deps) {
  const { db, args } = deps;

  // Validate environment: we need an interactive terminal.
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    process.stderr.write(
      "ccsearch: -i requires a TTY; for non-TTY callers use one-shot mode.\n"
    );
    return deps.EXIT_ENV;
  }

  const stdout = process.stdout;
  const stdin = process.stdin;

  // State
  let query = args.query || "";
  let cursor = 0; // selected index
  let scrollOffset = 0; // for long result lists
  let results = [];
  let searchPending = false; // simple debouncer
  let pendingTimer = null;
  let lastRenderTimer = null;
  let previewCache = new Map(); // sessionId -> rendered preview lines
  let lastDims = { rows: 0, cols: 0 };
  let exitReason = null; // { type: "resume"|"fork"|"resume-dangerous"|"print-id"|"print-path"|"cancel", row }
  // Recent-browse cache: populated on the first empty-query render, reused on
  // backspace-to-empty. Picker-session-scoped — not invalidated mid-session.
  let recentCache = null;
  // Picker mode. "browse" is the default; "rename" repurposes the prompt
  // line and result-list keystrokes for inline name editing on the selected
  // row. See picker-rename-session/design.md §Decision 2.
  let mode = "browse";
  let renameBuffer = "";

  function clearTimers() {
    if (pendingTimer) clearTimeout(pendingTimer);
    if (lastRenderTimer) clearTimeout(lastRenderTimer);
    pendingTimer = null;
    lastRenderTimer = null;
  }

  function teardown() {
    clearTimers();
    if (stdin.isTTY) stdin.setRawMode(false);
    stdout.write(ansi.showCursor);
    stdout.write(ansi.altScreenExit);
    stdin.pause();
  }

  function setup() {
    stdout.write(ansi.altScreenEnter);
    stdout.write(ansi.hideCursor);
    stdout.write(ansi.clearScreen);
    if (stdin.isTTY) stdin.setRawMode(true);
    stdin.resume();
    readline.emitKeypressEvents(stdin);
  }

  function doSearch() {
    searchPending = false;
    if (!query.trim()) {
      // Empty query → recent-conversations browse. Cache the list so
      // backspace-to-empty doesn't re-query the DB.
      if (recentCache === null && typeof deps.recentConversations === "function") {
        try {
          recentCache = deps.recentConversations(db, {
            limit: args.limit,
            projectFilter: args.project,
            sessionStore: deps.sessionStore,
          });
        } catch (e) {
          recentCache = [];
          recentCache.error = e.message || String(e);
        }
      }
      results = recentCache || [];
      cursor = 0;
      scrollOffset = 0;
      render();
      return;
    }
    try {
      // Pass sessionStore through so ftsSearch can apply pin-first ordering
      // to matching rows (pinned rows still must match the query).
      const localArgs = { ...args, query, sessionStore: deps.sessionStore };
      results = deps.ftsSearch(db, localArgs);
    } catch (e) {
      // FTS5 syntax errors etc. — show inline instead of crashing the picker.
      results = [];
      results.error = e.message || String(e);
    }
    if (cursor >= results.length) cursor = Math.max(0, results.length - 1);
    scrollOffset = 0;
    render();
  }

  function scheduleSearch() {
    if (pendingTimer) clearTimeout(pendingTimer);
    searchPending = true;
    pendingTimer = setTimeout(doSearch, 80);
    render();
  }

  function getDims() {
    const cols = stdout.columns || 80;
    const rows = stdout.rows || 24;
    if (cols !== lastDims.cols || rows !== lastDims.rows) {
      lastDims = { cols, rows };
      previewCache.clear();
    }
    return lastDims;
  }

  function buildResultLine(r, width, selected, dim) {
    const proj = deps.projectDisplay(r.projectPath, r.projectName);
    const date = deps.fmtDate(r.lastActivity);
    const sid = deps.shortSession(r.sessionId);
    const msgs = String(r.msgCount).padStart(4);
    // Pin indicator: 📌 for color, * for --no-color. Always at the start of
    // line 1, before the title/metadata. Empty string when not pinned.
    const pinMarker = r.isPinned ? (args.noColor ? "* " : "📌 ") : "";
    // Recent-browse rows carry a synthesized title; lead with it when present.
    // FTS rows have r.title === undefined and fall back to the original layout.
    const headBody = r.title
      ? `${r.title} · ${proj}  ${date}  ${msgs} msgs  ${sid}`
      : `${proj}  ${date}  ${msgs} msgs  ${sid}`;
    const head = pinMarker + headBody;
    const snippet = deps.colorizeSnippet(r.snippet, false);
    const headTrunc = truncateToWidth(head, width - 2);
    const snipTrunc = snippet ? truncateToWidth(snippet, width - 4) : "";

    const prefix = selected ? "▌ " : "  ";
    // In rename mode, dim every row uniformly to signal the list isn't the
    // active focus. Selection bold is also suppressed for the same reason.
    let styledHead;
    if (dim) {
      styledHead = deps.ANSI_DIM + headTrunc + deps.ANSI_RESET;
    } else if (selected) {
      styledHead = deps.ANSI_BOLD + headTrunc + deps.ANSI_RESET;
    } else {
      styledHead = headTrunc;
    }
    const styledSnip = snipTrunc
      ? deps.ANSI_DIM + snipTrunc + deps.ANSI_RESET
      : "";
    return { line1: prefix + styledHead, line2: snipTrunc ? "    " + styledSnip : null };
  }

  function getPreviewLines(sessionId, width) {
    if (!sessionId) return [];
    if (previewCache.has(sessionId)) return previewCache.get(sessionId);
    // Reuse renderPreview by capturing stdout into a string.
    const capture = [];
    const origWrite = stdout.write.bind(stdout);
    let buf = "";
    stdout.write = (chunk) => {
      buf += chunk;
      return true;
    };
    try {
      deps.renderPreview(db, sessionId, false);
    } catch (e) {
      buf += `(preview error: ${e.message || e})\n`;
    } finally {
      stdout.write = origWrite;
    }
    const raw = buf.split("\n");
    // Strip ANSI from preview (we re-style if needed) and wrap to width.
    const wrapped = [];
    for (const line of raw) {
      const wraps = wrapToWidth(line, width);
      for (const w of wraps) wrapped.push(w);
    }
    previewCache.set(sessionId, wrapped);
    return wrapped;
  }

  function render() {
    const { rows, cols } = getDims();
    if (rows < 6 || cols < 40) {
      stdout.write(ansi.clearScreen);
      stdout.write(ansi.moveTo(1, 1));
      stdout.write("terminal too small (need ≥ 40×6)");
      return;
    }

    const showPreview = cols >= 100 && results.length > 0;
    const listWidth = showPreview ? Math.floor(cols * 0.4) : cols;
    const previewWidth = showPreview ? cols - listWidth - 1 : 0;

    // Header
    stdout.write(ansi.clearScreen);
    stdout.write(ansi.moveTo(1, 1));
    let promptLine;
    if (mode === "rename") {
      // Rename mode: prompt switches color + label and shows the rename
      // buffer with a trailing cursor block (the cursor is hidden globally).
      promptLine =
        ansi.fgCyan + "rename> " + ansi.reset + renameBuffer + ansi.reverse + " " + ansi.reset;
    } else {
      promptLine =
        ansi.fgCyan + "ccsearch> " + ansi.reset + query +
        (searchPending ? " " + ansi.dim + "…" + ansi.reset : "");
    }
    stdout.write(truncateToWidth(promptLine, cols));

    // Help line — content depends on the mode.
    stdout.write(ansi.moveTo(2, 1));
    if (mode === "rename") {
      stdout.write(
        ansi.dim +
          truncateToWidth(
            "Enter save   Esc cancel   (empty + Enter clears the saved name)",
            cols
          ) +
          ansi.reset
      );
    } else {
      // Adds a yellow "Alt-Enter dangerous" entry when the dangerous-resume
      // capability is armed (CLI flag set). The reset inside dangerEntry
      // closes the yellow before the line continues, then we re-apply dim
      // for the rest of the line (truncateToWidth correctly counts only
      // visible characters when budgeting).
      const dangerEntry = deps.dangerouslySkipPermissions
        ? "   " + ansi.fgYellow + "Alt-Enter dangerous" + ansi.reset + ansi.dim
        : "";
      stdout.write(
        ansi.dim +
          truncateToWidth(
            "Enter resume" +
              dangerEntry +
              "   Ctrl-F fork   Ctrl-R rename   Ctrl-P pin   Ctrl-O print id   Ctrl-D print path   Esc cancel",
            cols
          ) +
          ansi.reset
      );
    }

    // Body region: rows 4..rows-2 (1-indexed)
    const bodyTop = 4;
    const bodyBottom = rows - 1;
    const bodyHeight = bodyBottom - bodyTop + 1;

    // Locate the pinned/unpinned partition for the divider. firstUnpinnedIdx
    // is the index of the first non-pinned row, or -1 if all rows are
    // pinned (or empty). Divider only shows when BOTH partitions are present.
    let firstUnpinnedIdx = -1;
    for (let i = 0; i < results.length; i++) {
      if (!results[i].isPinned) {
        firstUnpinnedIdx = i;
        break;
      }
    }
    const hasDivider =
      results.length > 0 && firstUnpinnedIdx > 0 && firstUnpinnedIdx < results.length;
    const dividerText =
      query && query.trim().length > 0 ? "── results ──" : "── recent ──";

    // Two lines per result (header + snippet). Compute visible window.
    // Reserve one body row for the divider when it exists. The reservation
    // is conservative (we reserve even when scrolled past the divider) for
    // a stable maxVisible across cursor movement.
    const rowsPerResult = 2;
    const usableHeight = hasDivider ? bodyHeight - 1 : bodyHeight;
    const maxVisible = Math.max(1, Math.floor(usableHeight / rowsPerResult));
    if (cursor < scrollOffset) scrollOffset = cursor;
    if (cursor >= scrollOffset + maxVisible) scrollOffset = cursor - maxVisible + 1;

    let line = bodyTop;
    if (results.error) {
      stdout.write(ansi.moveTo(line, 1));
      stdout.write(
        ansi.fgYellow + truncateToWidth("error: " + results.error, listWidth) + ansi.reset
      );
    } else if (results.length === 0) {
      stdout.write(ansi.moveTo(line, 1));
      if (!query.trim()) {
        // Empty query AND no recent conversations to show → fresh / empty index.
        stdout.write(
          ansi.dim +
            "no conversations indexed yet — run a Claude Code session, then ccsearch" +
            ansi.reset
        );
      } else if (searchPending) {
        stdout.write(ansi.dim + "Searching…" + ansi.reset);
      } else {
        stdout.write(ansi.dim + "no matches" + ansi.reset);
      }
    } else {
      const visible = results.slice(scrollOffset, scrollOffset + maxVisible);
      const dimBody = mode === "rename";
      let dividerWritten = false;
      for (let i = 0; i < visible.length; i++) {
        const idx = scrollOffset + i;
        // Insert the divider between the last pinned row and the first
        // unpinned row IF both are within the visible window. The divider
        // is render-only — the cursor cannot land on it, and `results`
        // does not contain it as an entry.
        if (
          hasDivider &&
          !dividerWritten &&
          idx === firstUnpinnedIdx &&
          scrollOffset < firstUnpinnedIdx &&
          line <= bodyBottom
        ) {
          stdout.write(ansi.moveTo(line, 1));
          stdout.write(ansi.dim + truncateToWidth(dividerText, listWidth) + ansi.reset);
          line++;
          dividerWritten = true;
          if (line > bodyBottom) break;
        }
        const r = visible[i];
        const selected = idx === cursor;
        const { line1, line2 } = buildResultLine(r, listWidth, selected, dimBody);
        if (line > bodyBottom) break;
        stdout.write(ansi.moveTo(line, 1));
        stdout.write(line1);
        line++;
        if (line2 && line <= bodyBottom) {
          stdout.write(ansi.moveTo(line, 1));
          stdout.write(line2);
          line++;
        }
      }
    }

    // Preview pane
    if (showPreview) {
      const selected = results[cursor];
      if (selected) {
        const previewLines = getPreviewLines(selected.sessionId, previewWidth - 2);
        let pLine = bodyTop;
        for (let i = 0; i < previewLines.length && pLine <= bodyBottom; i++) {
          stdout.write(ansi.moveTo(pLine, listWidth + 2));
          stdout.write(truncateToWidth(previewLines[i], previewWidth - 1));
          pLine++;
        }
      }
      // vertical separator
      for (let r = bodyTop; r <= bodyBottom; r++) {
        stdout.write(ansi.moveTo(r, listWidth + 1));
        stdout.write(ansi.dim + "│" + ansi.reset);
      }
    }

    // Footer
    stdout.write(ansi.moveTo(rows, 1));
    let footer;
    if (results.error) {
      footer = "ccsearch: query error";
    } else {
      footer = `${results.length} result${results.length === 1 ? "" : "s"}`;
      if (results.length > maxVisible) {
        footer += `  (${cursor + 1}/${results.length})`;
      }
    }
    stdout.write(ansi.dim + truncateToWidth(footer, cols) + ansi.reset);
  }

  function move(delta) {
    if (!results.length) return;
    cursor = Math.max(0, Math.min(results.length - 1, cursor + delta));
    render();
  }

  function spawnClaude(action, row) {
    teardown();
    const projectPath = row.projectPath;
    let cwd = process.cwd();
    if (projectPath) {
      if (deps.isExistingDir(projectPath)) {
        cwd = projectPath;
      } else {
        process.stderr.write(
          `ccsearch: project path '${projectPath}' is not a directory; resuming in current cwd. ` +
            `claude --resume may fail to find the session.\n`
        );
      }
    } else {
      process.stderr.write(
        "ccsearch: this conversation has no recorded project path; " +
          "resuming in current cwd. claude --resume may fail.\n"
      );
    }
    // Look up the saved name for this row (if any). The sessionStore is
    // loaded once at picker startup and mutated in-memory on rename / clear.
    const savedName =
      (deps.sessionStore && deps.sessionStore.names && deps.sessionStore.names[row.sessionId]) ||
      null;
    const claudeArgs = buildClaudeArgs(action, row, savedName);
    const result = childProc.spawnSync("claude", claudeArgs, {
      stdio: "inherit",
      cwd,
    });
    if (result.error) {
      if (result.error.code === "ENOENT") {
        process.stderr.write(
          "ccsearch: `claude` not found on PATH. " +
            "Install Claude Code or ensure `claude` is on your PATH.\n"
        );
        return deps.EXIT_ENV;
      }
      process.stderr.write(`ccsearch: spawning claude failed: ${result.error.message}\n`);
      return 3;
    }
    return result.status ?? 0;
  }

  function handleAction(reason) {
    if (reason === "cancel") {
      teardown();
      return deps.EXIT_OK;
    }
    const row = results[cursor];
    if (!row) {
      teardown();
      return deps.EXIT_OK;
    }
    if (reason === "resume") return spawnClaude("resume", row);
    if (reason === "resume-dangerous") return spawnClaude("resume-dangerous", row);
    if (reason === "fork") return spawnClaude("fork", row);
    if (reason === "print-id") {
      teardown();
      process.stdout.write(row.sessionId + "\n");
      return deps.EXIT_OK;
    }
    if (reason === "print-path") {
      teardown();
      process.stdout.write((row.projectPath || "") + "\n");
      return deps.EXIT_OK;
    }
    teardown();
    return deps.EXIT_OK;
  }

  // Promise-style event loop: resolve when an action is chosen or cancel.
  return new Promise((resolve) => {
    setup();

    const onResize = () => {
      previewCache.clear();
      render();
    };
    stdout.on("resize", onResize);

    function togglePin() {
      const row = results[cursor];
      if (!row) return;
      const store = deps.sessionStore;
      if (!store) return;
      store.pins = Array.isArray(store.pins) ? store.pins : [];
      const idx = store.pins.indexOf(row.sessionId);
      if (idx >= 0) {
        // Unpin: remove from pins.
        store.pins.splice(idx, 1);
      } else {
        // Pin: prepend so newest pin is first (per design Decision 1).
        store.pins.unshift(row.sessionId);
      }
      if (typeof deps.saveSessionStore === "function") {
        try {
          deps.saveSessionStore(store);
        } catch (e) {
          process.stderr.write(`ccsearch: could not save sessions.json: ${e.message}\n`);
        }
      }
      // Preserve cursor on the same row through the re-ordering. The
      // recentCache is invalidated to force re-partitioning; in FTS mode
      // we just re-run the search (no cache).
      const sessionIdToFollow = row.sessionId;
      recentCache = null;
      doSearch();
      const newIdx = results.findIndex((r) => r.sessionId === sessionIdToFollow);
      if (newIdx >= 0) {
        cursor = newIdx;
        // doSearch already rendered; re-render so cursor position updates.
        render();
      }
    }

    function commitRename() {
      const row = results[cursor];
      // No selected row → silently bail back to browse mode. The Ctrl-R
      // entry guard also checks this; defensive double-check.
      if (!row) {
        mode = "browse";
        renameBuffer = "";
        render();
        return;
      }
      const trimmed = renameBuffer.trim();
      const store = deps.sessionStore;
      if (store) {
        store.names = store.names || {};
        if (trimmed === "") {
          delete store.names[row.sessionId];
        } else {
          store.names[row.sessionId] = trimmed;
        }
        if (typeof deps.saveSessionStore === "function") {
          try {
            deps.saveSessionStore(store);
          } catch (e) {
            // Persistence failure is non-fatal — the in-memory state still
            // reflects the user's intent for the rest of the session.
            process.stderr.write(`ccsearch: could not save sessions.json: ${e.message}\n`);
          }
        }
      }
      // Update the in-memory row so the next render shows the change without
      // a DB requery. When cleared, fall back to the previously-synthesized
      // title if we still have one (we don't — the synthesized title was
      // discarded when the saved name took precedence in recentConversations).
      // The simplest correct behavior: set to null, accept that the row reads
      // as "<no title>" until the next picker session re-synthesizes.
      row.title = trimmed === "" ? null : trimmed;
      mode = "browse";
      renameBuffer = "";
      render();
    }

    function onKeypress(str, key) {
      if (!key) return;

      // Top-level mode switch. Rename mode steals all keystrokes for inline
      // editing of the selected row's name; browse mode is the default.
      if (mode === "rename") {
        // Ctrl-C exits the picker entirely, matching browse-mode behavior.
        if (key.ctrl && key.name === "c") return finish("cancel");
        // Esc cancels rename without writing.
        if (key.name === "escape") {
          mode = "browse";
          renameBuffer = "";
          render();
          return;
        }
        // Enter commits.
        if (key.name === "return") return commitRename();
        // Ctrl-U clears the buffer.
        if (key.ctrl && key.name === "u") {
          renameBuffer = "";
          render();
          return;
        }
        // Backspace pops one character.
        if (key.name === "backspace") {
          if (renameBuffer.length > 0) {
            renameBuffer = renameBuffer.slice(0, -1);
            render();
          }
          return;
        }
        // Printable characters append to the buffer.
        if (str && str.length === 1 && str >= " ") {
          renameBuffer += str;
          render();
        }
        return;
      }

      // --- Browse mode ---

      // Ctrl-C / Esc cancel
      if (key.ctrl && key.name === "c") return finish("cancel");
      if (key.name === "escape") return finish("cancel");
      if (key.ctrl && key.name === "d") return finish("print-path");
      if (key.ctrl && key.name === "o") return finish("print-id");
      if (key.ctrl && key.name === "f") return finish("fork");
      // Ctrl-R: enter rename mode on the selected row. No-op when no row is
      // selected (empty result set or empty-on-fresh-index).
      if (key.ctrl && key.name === "r") {
        const row = results[cursor];
        if (!row) return;
        mode = "rename";
        renameBuffer = row.title || "";
        render();
        return;
      }
      // Ctrl-P: toggle pin state for the selected row. Persists immediately;
      // re-runs the current search to apply the new ordering; keeps the
      // cursor on the same row so the user can chain pin operations.
      if (key.ctrl && key.name === "p") return togglePin();
      // Alt+Enter (key.meta) and Shift+Enter (key.shift, CSI-u terminals only)
      // route to the dangerous-resume action when armed. On terminals that do
      // not distinguish Shift+Enter from Enter, key.shift is false for plain
      // Enter, so this branch is correctly bypassed.
      if ((key.meta || key.shift) && key.name === "return") {
        if (deps.dangerouslySkipPermissions) return finish("resume-dangerous");
        // Not armed: fall through to plain resume so Alt/Shift+Enter still
        // does the expected "resume this row" thing rather than being a
        // silent no-op surprise.
        return finish("resume");
      }
      if (key.name === "return") return finish("resume");
      if (key.name === "up" || (key.ctrl && key.name === "k")) return move(-1);
      if (key.name === "down" || (key.ctrl && key.name === "j")) return move(1);
      if (key.name === "pageup") return move(-10);
      if (key.name === "pagedown") return move(10);
      if (key.name === "backspace") {
        if (query.length > 0) {
          query = query.slice(0, -1);
          scheduleSearch();
        }
        return;
      }
      if (key.ctrl && key.name === "u") {
        query = "";
        scheduleSearch();
        return;
      }
      // ---- catch-all: no new ctrl bindings below this line ----
      // The picker-status-bar drift-guard test (when it lands) will catch
      // BINDINGS-vs-onKeypress mismatches automatically; until then, any new
      // ctrl/meta keystroke handler must land ABOVE this guard or it will be
      // silently swallowed.
      if (key.ctrl || key.meta) return; // ignore other modifier keys
      if (str && str.length === 1 && str >= " ") {
        query += str;
        scheduleSearch();
      }
    }

    function finish(reason) {
      exitReason = reason;
      stdin.removeListener("keypress", onKeypress);
      stdout.removeListener("resize", onResize);
      const code = handleAction(reason);
      resolve(code);
    }

    stdin.on("keypress", onKeypress);

    // Initial render. doSearch handles both branches:
    //  - non-empty query → run FTS
    //  - empty query     → populate recentCache and render the recent list
    doSearch();
  });
}

module.exports = runPicker;

// Test-only exports. Guarded so production behavior is unaffected; the tests
// in bin/ccsearch.test.sh set CCSEARCH_TEST=1 before requiring this file.
if (process.env.CCSEARCH_TEST) {
  module.exports._test = { buildClaudeArgs };
}
