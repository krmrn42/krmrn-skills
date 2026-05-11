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
  let exitReason = null; // { type: "resume"|"fork"|"print-id"|"print-path"|"cancel", row }
  // Recent-browse cache: populated on the first empty-query render, reused on
  // backspace-to-empty. Picker-session-scoped — not invalidated mid-session.
  let recentCache = null;

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
      const localArgs = { ...args, query };
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

  function buildResultLine(r, width, selected) {
    const proj = deps.projectDisplay(r.projectPath, r.projectName);
    const date = deps.fmtDate(r.lastActivity);
    const sid = deps.shortSession(r.sessionId);
    const msgs = String(r.msgCount).padStart(4);
    // Recent-browse rows carry a synthesized title; lead with it when present.
    // FTS rows have r.title === undefined and fall back to the original layout.
    const head = r.title
      ? `${r.title} · ${proj}  ${date}  ${msgs} msgs  ${sid}`
      : `${proj}  ${date}  ${msgs} msgs  ${sid}`;
    const snippet = deps.colorizeSnippet(r.snippet, false);
    const headTrunc = truncateToWidth(head, width - 2);
    const snipTrunc = snippet ? truncateToWidth(snippet, width - 4) : "";

    const prefix = selected ? "▌ " : "  ";
    const styledHead = selected
      ? deps.ANSI_BOLD + headTrunc + deps.ANSI_RESET
      : headTrunc;
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
    const promptLine =
      ansi.fgCyan + "ccsearch> " + ansi.reset + query + (searchPending ? " " + ansi.dim + "…" + ansi.reset : "");
    stdout.write(truncateToWidth(promptLine, cols));

    // Help line
    stdout.write(ansi.moveTo(2, 1));
    stdout.write(
      ansi.dim +
        truncateToWidth(
          "Enter resume   Ctrl-F fork   Ctrl-O print id   Ctrl-D print path   Esc cancel",
          cols
        ) +
        ansi.reset
    );

    // Body region: rows 4..rows-2 (1-indexed)
    const bodyTop = 4;
    const bodyBottom = rows - 1;
    const bodyHeight = bodyBottom - bodyTop + 1;

    // Two lines per result (header + snippet). Compute visible window.
    const rowsPerResult = 2;
    const maxVisible = Math.max(1, Math.floor(bodyHeight / rowsPerResult));
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
      for (let i = 0; i < visible.length; i++) {
        const idx = scrollOffset + i;
        const r = visible[i];
        const selected = idx === cursor;
        const { line1, line2 } = buildResultLine(r, listWidth, selected);
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
    const claudeArgs =
      action === "fork"
        ? ["--fork-session", "--resume", row.sessionId]
        : ["--resume", row.sessionId];
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

    function onKeypress(str, key) {
      if (!key) return;
      // Ctrl-C / Esc cancel
      if (key.ctrl && key.name === "c") return finish("cancel");
      if (key.name === "escape") return finish("cancel");
      if (key.ctrl && key.name === "d") return finish("print-path");
      if (key.ctrl && key.name === "o") return finish("print-id");
      if (key.ctrl && key.name === "f") return finish("fork");
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
