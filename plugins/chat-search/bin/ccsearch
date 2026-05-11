#!/usr/bin/env node
// ccsearch — relevance-ranked full-text search across local Claude Code conversations.
//
// Reads ~/.claude/conversation-search.db (FTS5-backed SQLite, maintained by
// Claude Code itself). Read-only — never writes, never mutates anything under
// ~/.claude/. See plugins/chat-search/README.md for usage.
//
// Exit codes:
//   0  success (zero matches is success)
//   1  user error (bad regex, unparseable date, conflicting flags, etc.)
//   2  environment error (DB missing, schema drift, unsupported Node, no TTY for -i)
//   3  internal error (uncaught exception, write attempt against read-only DB)

"use strict";

const EXIT_OK = 0;
const EXIT_USER = 1;
const EXIT_ENV = 2;
const EXIT_INTERNAL = 3;

// --- Runtime probes ------------------------------------------------------

function dieEnv(msg) {
  process.stderr.write("ccsearch: " + msg + "\n");
  process.exit(EXIT_ENV);
}

function dieUser(msg) {
  process.stderr.write("ccsearch: " + msg + "\n");
  process.exit(EXIT_USER);
}

function parseNodeVersion(v) {
  const m = /^v(\d+)\.(\d+)\.(\d+)/.exec(v);
  if (!m) return [0, 0, 0];
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function isNodeAtLeast(current, required) {
  for (let i = 0; i < 3; i++) {
    if (current[i] > required[i]) return true;
    if (current[i] < required[i]) return false;
  }
  return true;
}

const REQUIRED_NODE = [22, 5, 0];
const currentNode = parseNodeVersion(process.version);
if (!isNodeAtLeast(currentNode, REQUIRED_NODE)) {
  dieEnv(
    `this script requires Node.js 22.5+ (found ${process.version}).\n` +
      `node:sqlite was added in v22.5 and is the engine we use to query\n` +
      `~/.claude/conversation-search.db.\n\n` +
      `Install or upgrade Node:\n\n` +
      `  brew install node              # macOS (Homebrew)\n` +
      `  winget install OpenJS.NodeJS   # Windows (WinGet)\n` +
      `  sudo pacman -S nodejs          # Manjaro / Arch\n` +
      `  sudo apt install nodejs        # Debian / Ubuntu (may be too old; consider nvm or nodesource)\n` +
      `  nvm install --lts              # any (using nvm)\n\n` +
      `If you installed Claude Code via \`npm install -g @anthropic-ai/claude-code\`,\n` +
      `Node is already on your system — your shell's PATH may just not see\n` +
      `the right \`node\` binary.`
  );
}

let DatabaseSync;
try {
  ({ DatabaseSync } = require("node:sqlite"));
} catch (e) {
  dieEnv(
    `node:sqlite is not available in this Node build (${process.version}).\n` +
      `Cause: ${e.message}\n\n` +
      `Use the official Node distribution from https://nodejs.org/ which ships\n` +
      `the built-in SQLite module. Some non-standard builds compile Node without it.`
  );
}

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function defaultIndexPath() {
  const xdg = process.env.XDG_DATA_HOME && process.env.XDG_DATA_HOME.trim();
  const base = xdg && xdg.length > 0 ? xdg : path.join(os.homedir(), ".local", "share");
  return path.join(base, "krmrn42-skills", "chat-search", "index.db");
}

// sessions.json holds picker-side per-session metadata (saved names, pins).
// Schema: { version: 1, names: { <session-id>: <string> }, pins: [<session-id>, ...] }
// Lives under XDG_CONFIG_HOME because it's user-edited config, not regenerable cache.
function sessionsConfigPath() {
  const xdg = process.env.XDG_CONFIG_HOME && process.env.XDG_CONFIG_HOME.trim();
  const base = xdg && xdg.length > 0 ? xdg : path.join(os.homedir(), ".config");
  return path.join(base, "krmrn42-skills", "chat-search", "sessions.json");
}

function emptySessionStore() {
  return { version: 1, names: {}, pins: [] };
}

// Load sessions.json. Returns the empty default on missing file or parse error.
// On parse error, writes a one-line warning to stderr — corrupt config should
// surface visibly without blocking the picker.
function loadSessionStore(configPath) {
  const p = configPath || sessionsConfigPath();
  let raw;
  try {
    raw = fs.readFileSync(p, "utf8");
  } catch (e) {
    if (e && e.code === "ENOENT") return emptySessionStore();
    process.stderr.write(`ccsearch: could not read ${p}: ${e.message}\n`);
    return emptySessionStore();
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    process.stderr.write(`ccsearch: ${p} is not valid JSON (${e.message}); using empty config\n`);
    return emptySessionStore();
  }
  // Defensive normalization. We tolerate missing fields rather than rejecting
  // a partially-shaped file — preserves forward-compat with future fields.
  const store = emptySessionStore();
  if (parsed && typeof parsed === "object") {
    if (typeof parsed.version === "number") store.version = parsed.version;
    if (parsed.names && typeof parsed.names === "object" && !Array.isArray(parsed.names)) {
      for (const [k, v] of Object.entries(parsed.names)) {
        if (typeof v === "string" && v.length > 0) store.names[k] = v;
      }
    }
    if (Array.isArray(parsed.pins)) {
      for (const p of parsed.pins) if (typeof p === "string" && p.length > 0) store.pins.push(p);
    }
  }
  return store;
}

// Atomic write: serialize, write to .tmp, then rename. Failure leaves the
// previous file intact. Creates parent directories on demand.
function saveSessionStore(store, configPath) {
  const p = configPath || sessionsConfigPath();
  const dir = path.dirname(p);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = p + ".tmp";
  const body = JSON.stringify(store, null, 2) + "\n";
  fs.writeFileSync(tmp, body, "utf8");
  fs.renameSync(tmp, p);
}

const PLUGIN_DEFAULT_DB = defaultIndexPath();
const DEFAULT_DB = process.env.CCSEARCH_DB || PLUGIN_DEFAULT_DB;
// True when ccsearch is using the plugin-owned index (the path nobody overrode).
function isPluginOwnedDb(p) {
  return p === PLUGIN_DEFAULT_DB;
}

const EXPECTED_TABLES = new Set(["messages", "messages_fts"]);
const EXPECTED_COLUMNS = new Set([
  "id",
  "conversation_id",
  "project_path",
  "project_name",
  "timestamp",
  "type",
  "content",
  "message_uuid",
  "parent_uuid",
]);

const SNIPPET_OPEN = "<<<";
const SNIPPET_CLOSE = ">>>";

const ANSI_BOLD = "\x1b[1m";
const ANSI_DIM = "\x1b[2m";
const ANSI_RESET = "\x1b[0m";

// --- DB / schema ---------------------------------------------------------

function openDb(dbPath, opts = {}) {
  const usingPluginOwned = isPluginOwnedDb(dbPath);
  if (!fs.existsSync(dbPath)) {
    if (usingPluginOwned) {
      // Create the parent dir; the DB file itself will be created by node:sqlite
      // when we open it read-write.
      try {
        fs.mkdirSync(path.dirname(dbPath), { recursive: true });
      } catch (e) {
        dieEnv(`could not create index directory at ${path.dirname(dbPath)}: ${e.message}`);
      }
    } else {
      dieEnv(
        `${dbPath} not found.\n` +
          `Use Claude Code at least once to create the database,\n` +
          `or pass --db-path / set CCSEARCH_DB.`
      );
    }
  }
  // For the plugin-owned index we need a read-write connection so the indexer
  // can refresh it. For a user-provided path (`--db-path` / CCSEARCH_DB) we
  // stay strictly read-only (the user is opting into reading an external DB).
  const readOnly = opts.readWrite ? false : !usingPluginOwned;
  try {
    return new DatabaseSync(dbPath, { readOnly });
  } catch (e) {
    dieEnv(`could not open ${dbPath}: ${e.message}`);
  }
}

function probeSchema(db) {
  const rows = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type IN ('table','view') " +
        "AND name IN ('messages','messages_fts')"
    )
    .all();
  const found = new Set(rows.map((r) => r.name));
  const missingTables = [...EXPECTED_TABLES].filter((t) => !found.has(t)).sort();
  if (missingTables.length) {
    dieEnv(
      `schema does not match expected layout — missing table(s): ${missingTables.join(", ")}.\n` +
        `This usually means Claude Code has been updated and chat-search\n` +
        `needs to update too. File an issue or \`git pull\` and reinstall.`
    );
  }
  const cols = new Set(db.prepare("PRAGMA table_info(messages)").all().map((r) => r.name));
  const missingCols = [...EXPECTED_COLUMNS].filter((c) => !cols.has(c)).sort();
  if (missingCols.length) {
    dieEnv(
      `schema does not match expected layout — missing column(s) in \`messages\`: ` +
        `${missingCols.join(", ")}.\n` +
        `This usually means Claude Code has been updated and chat-search\n` +
        `needs to update too. File an issue or \`git pull\` and reinstall.`
    );
  }
}

function detectTimestampScale(db) {
  const row = db.prepare("SELECT MAX(timestamp) AS m FROM messages").get();
  if (!row || !row.m) return 1000;
  return row.m > 10_000_000_000 ? 1000 : 1;
}

// --- Helpers -------------------------------------------------------------

function parseSince(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    dieUser(`--since: cannot parse '${s}' as YYYY-MM-DD`);
  }
  const d = new Date(s + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) {
    dieUser(`--since: cannot parse '${s}' as YYYY-MM-DD`);
  }
  return Math.floor(d.getTime() / 1000);
}

function projectDisplay(projectPath, projectName) {
  if (!projectPath) return projectName || "?";
  const parts = projectPath.split("/").filter(Boolean);
  if (parts.length >= 2) return parts.slice(-2).join("/");
  return projectName || projectPath;
}

function shortSession(sid) {
  return sid ? sid.slice(0, 8) : "????????";
}

function fmtDate(ts) {
  if (!ts) return "????-??-??";
  let n = ts;
  if (n > 10_000_000_000) n = Math.floor(n / 1000);
  const d = new Date(n * 1000);
  if (Number.isNaN(d.getTime())) return "????-??-??";
  return d.toISOString().slice(0, 10);
}

function colorizeSnippet(snippet, useColor) {
  if (!snippet) return "";
  let s = snippet;
  if (useColor) {
    s = s.split(SNIPPET_OPEN).join(ANSI_BOLD).split(SNIPPET_CLOSE).join(ANSI_RESET);
  }
  return s.split(/\s+/).filter(Boolean).join(" ");
}

function shellQuote(s) {
  if (s === "" || /[^A-Za-z0-9_./@:+\-=,%]/.test(s)) {
    return "'" + s.replace(/'/g, "'\\''") + "'";
  }
  return s;
}

function resumeOneLiner(sessionId, projectPath) {
  if (!projectPath) {
    return `claude --resume ${sessionId}  # original project path unknown`;
  }
  return `(cd ${shellQuote(projectPath)} && claude --resume ${sessionId})`;
}

const _projectDirCache = new Map();
function isExistingDir(p) {
  if (!p) return false;
  if (_projectDirCache.has(p)) return _projectDirCache.get(p);
  let ok = false;
  try {
    ok = fs.statSync(p).isDirectory();
  } catch (_) {
    ok = false;
  }
  _projectDirCache.set(p, ok);
  return ok;
}

// --- Search --------------------------------------------------------------

function typeFilterClause(includeTools, onlyUser) {
  if (onlyUser) return { sql: "m.type = ?", params: ["user"] };
  if (includeTools)
    return { sql: "m.type IN (?, ?, ?, ?)", params: ["user", "assistant", "tool_use", "tool_result"] };
  return { sql: "m.type IN (?, ?)", params: ["user", "assistant"] };
}

function dieFts(query, err) {
  const msg = err.message || String(err);
  if (/no such column|fts5|syntax error/i.test(msg)) {
    let suggestion = "";
    if (query.includes("-") && !(query.startsWith('"') && query.endsWith('"'))) {
      suggestion =
        `\nFTS5 treats '-' as NOT and '"…"' as a phrase. ` +
        `To search for the literal phrase, quote it:\n` +
        `    ccsearch '"${query}"'`;
    }
    dieUser(`FTS5 query error: ${msg}${suggestion}`);
  }
  dieUser(`FTS5 query error: ${msg}`);
}

function buildWhereExtras(args) {
  const extras = [];
  const params = [];
  if (args.since) {
    extras.push("m.timestamp >= ?");
    params.push(args.sinceTs);
  }
  if (args.project) {
    extras.push("(LOWER(m.project_name) LIKE ? OR LOWER(m.project_path) LIKE ?)");
    const like = `%${args.project.toLowerCase()}%`;
    params.push(like, like);
  }
  return { sql: extras.length ? "AND " + extras.join(" AND ") : "", params };
}

function ftsSearch(db, args) {
  const { sql: typeSql, params: typeParams } = typeFilterClause(
    args.includeTools,
    args.onlyUser
  );
  const { sql: whereExtraSql, params: extraParams } = buildWhereExtras(args);

  const innerLimit = Math.max(args.limit * 50, 500);

  const sql = `
SELECT
  m.conversation_id AS conversation_id,
  m.project_path AS project_path,
  m.project_name AS project_name,
  m.timestamp AS timestamp,
  snippet(messages_fts, 1, ?, ?, '…', 12) AS snippet,
  bm25(messages_fts) AS score
FROM messages_fts
JOIN messages m ON m.id = messages_fts.id
WHERE messages_fts MATCH ?
  AND ${typeSql}
  ${whereExtraSql}
ORDER BY bm25(messages_fts)
LIMIT ?
`;

  const params = [SNIPPET_OPEN, SNIPPET_CLOSE, args.query, ...typeParams, ...extraParams, innerLimit];
  let rows;
  try {
    rows = db.prepare(sql).all(...params);
  } catch (e) {
    dieFts(args.query, e);
  }
  const seen = new Map();
  for (const r of rows) {
    if (seen.has(r.conversation_id)) continue;
    seen.set(r.conversation_id, {
      sessionId: r.conversation_id,
      projectPath: r.project_path || "",
      projectName: r.project_name || "",
      lastActivity: 0,
      msgCount: 0,
      snippet: r.snippet || "",
      score: r.score,
    });
    if (seen.size >= args.limit) break;
  }
  // Pinned rows that match the FTS query promote above ranked rows. Pinned
  // rows that DON'T match the query are not injected here — pin ≠ override.
  const filled = fillMeta(db, [...seen.values()]);
  return applyPinOrdering(filled, args.sessionStore, args.limit);
}

function regexPostfilter(db, args, pattern) {
  const { sql: typeSql, params: typeParams } = typeFilterClause(
    args.includeTools,
    args.onlyUser
  );
  const { sql: whereExtraSql, params: extraParams } = buildWhereExtras(args);

  const sql = `
SELECT
  m.conversation_id AS conversation_id,
  m.project_path AS project_path,
  m.project_name AS project_name,
  m.timestamp AS timestamp,
  m.content AS content,
  snippet(messages_fts, 1, ?, ?, '…', 12) AS snippet,
  bm25(messages_fts) AS score
FROM messages_fts
JOIN messages m ON m.id = messages_fts.id
WHERE messages_fts MATCH ?
  AND ${typeSql}
  ${whereExtraSql}
ORDER BY bm25(messages_fts)
`;
  const params = [SNIPPET_OPEN, SNIPPET_CLOSE, args.query, ...typeParams, ...extraParams];

  let rows;
  try {
    rows = db.prepare(sql).all(...params);
  } catch (e) {
    dieFts(args.query, e);
  }
  const seen = new Map();
  for (const r of rows) {
    if (seen.has(r.conversation_id)) continue;
    if (!r.content || !pattern.test(r.content)) continue;
    seen.set(r.conversation_id, {
      sessionId: r.conversation_id,
      projectPath: r.project_path || "",
      projectName: r.project_name || "",
      lastActivity: 0,
      msgCount: 0,
      snippet: r.snippet || "",
      score: r.score,
    });
    if (seen.size >= args.limit) break;
  }
  return fillMeta(db, [...seen.values()]);
}

function regexScan(db, args, pattern) {
  const { sql: typeSql, params: typeParams } = typeFilterClause(
    args.includeTools,
    args.onlyUser
  );
  const { sql: whereExtraSql, params: extraParams } = buildWhereExtras(args);

  const totalRow = db
    .prepare(`SELECT COUNT(*) AS c FROM messages m WHERE ${typeSql} ${whereExtraSql}`)
    .get(...typeParams, ...extraParams);
  const total = totalRow ? totalRow.c : 0;
  const progressThreshold = 50_000;
  const progressInterval = 10_000;
  const progressEnabled = total > progressThreshold && process.stderr.isTTY;

  if (progressEnabled) {
    process.stderr.write(`ccsearch: scanning ${total.toLocaleString()} messages…\n`);
  }

  const sql = `
SELECT m.conversation_id AS conversation_id, m.project_path AS project_path,
       m.project_name AS project_name, m.timestamp AS timestamp, m.content AS content
FROM messages m
WHERE ${typeSql}
${whereExtraSql}
ORDER BY m.timestamp DESC
`;
  const iter = db.prepare(sql).iterate(...typeParams, ...extraParams);

  const seen = new Map();
  let scanned = 0;
  for (const r of iter) {
    scanned++;
    if (progressEnabled && scanned % progressInterval === 0) {
      process.stderr.write(`ccsearch: scanned ${scanned.toLocaleString()}/${total.toLocaleString()}…\n`);
    }
    if (seen.has(r.conversation_id)) continue;
    if (!r.content) continue;
    // Use String.match (non-global pattern returns first match or null)
    const m = r.content.match(pattern);
    if (!m) continue;
    const matchIdx = typeof m.index === "number" ? m.index : 0;
    const start = Math.max(0, matchIdx - 40);
    const end = Math.min(r.content.length, matchIdx + m[0].length + 40);
    const prefix = start > 0 ? "…" : "";
    const suffix = end < r.content.length ? "…" : "";
    const snippet =
      prefix +
      r.content.slice(start, matchIdx) +
      SNIPPET_OPEN +
      r.content.slice(matchIdx, matchIdx + m[0].length) +
      SNIPPET_CLOSE +
      r.content.slice(matchIdx + m[0].length, end) +
      suffix;
    seen.set(r.conversation_id, {
      sessionId: r.conversation_id,
      projectPath: r.project_path || "",
      projectName: r.project_name || "",
      lastActivity: 0,
      msgCount: 0,
      snippet,
      score: 0.0,
    });
    if (seen.size >= args.limit) break;
  }
  return fillMeta(db, [...seen.values()]);
}

function fillMeta(db, results) {
  const stmt = db.prepare(
    "SELECT COUNT(*) AS c, MAX(timestamp) AS t FROM messages WHERE conversation_id = ?"
  );
  for (const r of results) {
    const row = stmt.get(r.sessionId);
    r.msgCount = (row && row.c) || 0;
    r.lastActivity = (row && row.t) || 0;
  }
  return results;
}

// --- Recent-conversations browse (empty-query picker mode) ---------------

// Wrapper tags Claude Code uses to embed non-user content inside a
// `type: 'user'` JSONL row. When synthesizing a conversation title we skip
// over these to find the real first user message. Tail snippets (the "where
// did I leave off" line) intentionally do NOT strip wrappers — see
// design.md §Decision 3.
//
// Validated by scanning ~412 real user messages across recent JSONL fixtures.
// Most common: <local-command-caveat>, <command-name>, <local-command-stdout>.
const WRAPPER_TAGS = new Set([
  "command-name",
  "command-message",
  "command-args",
  "local-command-stdout",
  "local-command-stderr",
  "local-command-caveat",
  "stdin",
  "bash-input",
  "bash-stdout",
  "bash-stderr",
  "task-notification",
  "system-reminder",
]);

function isWrapperContent(s) {
  if (!s) return true;
  const trimmed = s.replace(/^\s+/, "");
  const m = trimmed.match(/^<([a-zA-Z0-9_-]+)>/);
  if (!m) return false;
  return WRAPPER_TAGS.has(m[1]);
}

function synthesizeTitle(rawContent) {
  if (!rawContent) return null;
  const firstLine = rawContent.split("\n", 1)[0].replace(/\s+/g, " ").trim();
  if (firstLine.length === 0) return null;
  const CAP = 80;
  return firstLine.length > CAP ? firstLine.slice(0, CAP) + "…" : firstLine;
}

function normalizeTailContent(rawContent) {
  if (!rawContent) return "";
  // Strip ANSI escapes (defensive — JSONL content shouldn't contain them,
  // but indexed content has surprised us before). Constructed char class to
  // avoid embedding a literal ESC byte in the source.
  const ESC = String.fromCharCode(0x1b);
  const ansiRe = new RegExp(ESC + "\\[[0-?]*[ -/]*[@-~]", "g");
  let s = rawContent.replace(ansiRe, "");
  // Collapse all whitespace runs to single spaces (the picker renders this
  // as a single line; the spec calls for 1-2 visual lines, which
  // truncateToWidth handles based on display width).
  s = s.replace(/\s+/g, " ").trim();
  if (s.length > 240) s = s.slice(0, 240);
  return s;
}

// applyPinOrdering partitions a result-row array into pinned-first + the rest.
// Pinned rows preserve `sessionStore.pins` order (most-recently-pinned first).
// Non-pinned rows preserve their incoming order (recent-most-first or
// BM25-ranked depending on the caller). Each row is annotated with isPinned
// for downstream rendering. The total is capped at `limit`; pinned rows
// count toward the cap. See picker-pin-sessions/design.md §Decision 2.
function applyPinOrdering(rows, sessionStore, limit) {
  const pins = (sessionStore && Array.isArray(sessionStore.pins)) ? sessionStore.pins : [];
  if (!pins.length) {
    // No pins → annotate all rows as not pinned and return at most `limit`.
    return rows.slice(0, Math.max(0, limit | 0)).map((r) => ({ ...r, isPinned: false }));
  }
  // Build a quick set + index map so we can preserve pin order in O(n).
  const pinIndex = new Map();
  for (let i = 0; i < pins.length; i++) pinIndex.set(pins[i], i);
  const pinned = [];
  const unpinned = [];
  for (const r of rows) {
    if (pinIndex.has(r.sessionId)) {
      pinned.push({ ...r, isPinned: true });
    } else {
      unpinned.push({ ...r, isPinned: false });
    }
  }
  // Sort pinned rows by their position in sessionStore.pins so pin-order
  // matches what the user expects (newest pin first).
  pinned.sort((a, b) => pinIndex.get(a.sessionId) - pinIndex.get(b.sessionId));
  const out = pinned.concat(unpinned);
  return out.slice(0, Math.max(0, limit | 0));
}

function recentConversations(db, { limit, projectFilter, sessionStore }) {
  // Step 1: most recent conversations across all (or one) projects.
  const projectExtra = projectFilter
    ? "AND (LOWER(project_name) LIKE ? OR LOWER(project_path) LIKE ?)"
    : "";
  const projectParams = projectFilter
    ? [
        "%" + String(projectFilter).toLowerCase() + "%",
        "%" + String(projectFilter).toLowerCase() + "%",
      ]
    : [];
  const recentSql = `
SELECT
  conversation_id AS conversation_id,
  MAX(project_path) AS project_path,
  MAX(project_name) AS project_name,
  MAX(timestamp) AS last_ts,
  COUNT(*) AS msg_count
FROM messages
WHERE type IN ('user', 'assistant')
${projectExtra}
GROUP BY conversation_id
ORDER BY last_ts DESC
LIMIT ?
`;
  const recent = db
    .prepare(recentSql)
    .all(...projectParams, Math.max(1, limit | 0));

  if (!recent.length) return [];

  // Step 2: title source (up to 5 candidate user messages per conversation).
  const titleStmt = db.prepare(
    "SELECT content FROM messages " +
      "WHERE conversation_id = ? AND type = 'user' " +
      "ORDER BY timestamp ASC LIMIT 5"
  );
  // Step 3: tail message (most recent user/assistant).
  const tailStmt = db.prepare(
    "SELECT content FROM messages " +
      "WHERE conversation_id = ? AND type IN ('user', 'assistant') " +
      "ORDER BY timestamp DESC LIMIT 1"
  );

  // Saved-name overlay: when a sessionStore is passed and has a name for
  // this conversation_id, it overrides the synthesized title. Synthesis still
  // runs for rows without a saved name (existing recent-browse behavior).
  const namesMap = (sessionStore && sessionStore.names) || {};

  const results = [];
  for (const conv of recent) {
    let title = null;
    const saved = namesMap[conv.conversation_id];
    if (typeof saved === "string" && saved.length > 0) {
      title = saved;
    } else {
      const candidates = titleStmt.all(conv.conversation_id);
      for (const c of candidates) {
        if (!c.content) continue;
        if (isWrapperContent(c.content)) continue;
        title = synthesizeTitle(c.content);
        if (title) break;
      }
    }
    const tailRow = tailStmt.get(conv.conversation_id);
    const tail = tailRow ? normalizeTailContent(tailRow.content) : "";

    results.push({
      sessionId: conv.conversation_id,
      projectPath: conv.project_path || "",
      projectName: conv.project_name || "",
      lastActivity: conv.last_ts || 0,
      msgCount: conv.msg_count || 0,
      snippet: tail,
      score: 0,
      title,
    });
  }
  // Pinned rows (from sessionStore.pins) sort to the top in pin-order. Rows
  // not in the SQL recent-N don't get injected here — pinning promotes
  // within the result set, not above it.
  return applyPinOrdering(results, sessionStore, Math.max(1, limit | 0));
}

// --- Output --------------------------------------------------------------

function renderText(results, useColor) {
  if (!results.length) {
    process.stdout.write("no matches\n");
    return;
  }
  const lines = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const proj = projectDisplay(r.projectPath, r.projectName);
    const date = fmtDate(r.lastActivity);
    const snippet = colorizeSnippet(r.snippet, useColor);
    const idx = String(i + 1).padStart(3);
    const sid = shortSession(r.sessionId);
    const msgs = String(r.msgCount).padStart(4);
    let header;
    if (useColor) {
      header = `${idx}. ${ANSI_BOLD}${proj}${ANSI_RESET}  ${ANSI_DIM}${date}  ${msgs} msgs  ${sid}${ANSI_RESET}`;
    } else {
      header = `${idx}. ${proj}  ${date}  ${msgs} msgs  ${sid}`;
    }
    lines.push(header);
    if (snippet) lines.push(`     ${snippet}`);
    lines.push(`     ${resumeOneLiner(r.sessionId, r.projectPath)}`);
  }
  process.stdout.write(lines.join("\n") + "\n");
}

function renderTsv(results) {
  const out = [];
  for (const r of results) {
    const proj = projectDisplay(r.projectPath, r.projectName);
    const date = fmtDate(r.lastActivity);
    const snippet = r.snippet.split(/\s+/).filter(Boolean).join(" ");
    const score = (typeof r.score === "number" ? r.score : 0).toFixed(4);
    out.push(
      [r.sessionId, proj, r.projectPath, date, r.msgCount, snippet, score].join("\t")
    );
  }
  if (out.length) process.stdout.write(out.join("\n") + "\n");
}

// --- Preview (for the built-in picker's preview pane) --------------------

function renderPreview(db, sessionId, useColor) {
  probeSchema(db);
  const head = db
    .prepare(
      "SELECT project_path, project_name, " +
        "       (SELECT COUNT(*) FROM messages WHERE conversation_id = ?) AS msg_count, " +
        "       (SELECT MAX(timestamp) FROM messages WHERE conversation_id = ?) AS last_ts, " +
        "       (SELECT MIN(timestamp) FROM messages WHERE conversation_id = ?) AS first_ts " +
        "FROM messages WHERE conversation_id = ? LIMIT 1"
    )
    .get(sessionId, sessionId, sessionId, sessionId);
  if (!head) {
    process.stdout.write(`(no messages found for session ${shortSession(sessionId)})\n`);
    return;
  }
  const proj = projectDisplay(head.project_path || "", head.project_name || "");
  const bold = useColor ? ANSI_BOLD : "";
  const dim = useColor ? ANSI_DIM : "";
  const reset = useColor ? ANSI_RESET : "";
  process.stdout.write(
    `${bold}${proj}${reset}  ${dim}(${fmtDate(head.first_ts)} → ${fmtDate(head.last_ts)}, ${head.msg_count} msgs)${reset}\n`
  );
  process.stdout.write(`${dim}session ${sessionId}${reset}\n\n`);

  const rows = db
    .prepare(
      "SELECT type, content, timestamp FROM messages " +
        "WHERE conversation_id = ? AND type IN ('user','assistant') " +
        "ORDER BY timestamp ASC LIMIT 20"
    )
    .all(sessionId);
  for (const r of rows) {
    const marker = r.type === "user" ? "▶" : "◀";
    process.stdout.write(`${bold}${marker} ${r.type}${reset} ${dim}${fmtDate(r.timestamp)}${reset}\n`);
    let text = (r.content || "").trim();
    if (text.length > 600) text = text.slice(0, 600) + " […]";
    for (const line of text.split("\n")) process.stdout.write(`  ${line}\n`);
    process.stdout.write("\n");
  }
}

// --- Argument parsing ----------------------------------------------------

// Single source of truth for --help. The drift-guard test in ccsearch.test.sh
// diffs the long-form flags in OPTIONS against the `case "--…":` lines in
// parseArgs and fails if they disagree, so every parser flag must appear here.
const OPTIONS = [
  // Core
  {
    flags: ["-h", "--help"],
    group: "Options",
    description: "Show this help message and exit.",
  },
  {
    flags: ["-i", "--interactive"],
    group: "Options",
    description:
      "Open the built-in TUI picker. Default on a TTY; this flag forces the " +
      "picker even when other inference would dispatch to one-shot. Inside the " +
      "picker: Enter resumes, Ctrl-F forks, Ctrl-R renames, Ctrl-P pins, Ctrl-T " +
      "launches in remote-control mode, Ctrl-O prints session id, Ctrl-D prints " +
      "project path, arrow keys / PgUp / PgDn navigate, Esc cancels.",
  },
  {
    flags: ["-l", "--list"],
    group: "Options",
    description:
      "Force one-shot ranked text output (the pre-default behavior). Useful on " +
      "a TTY when you want a printable list instead of the picker. Mutually " +
      "exclusive with -i.",
  },

  // Filters
  {
    flags: ["--regex"],
    placeholder: "PAT",
    group: "Filters",
    description:
      "Post-filter results with this regex (Node RegExp flavor, `m` flag). " +
      "Without a positional query, requires --scan.",
  },
  {
    flags: ["--scan"],
    group: "Filters",
    description:
      "With --regex and no positional query, full-scan all messages. Required " +
      "as an explicit acknowledgment because the scan is slow on large indexes.",
  },
  {
    flags: ["--include-tools"],
    group: "Filters",
    description:
      "Also search tool_use / tool_result rows (excluded by default). " +
      "Mutually exclusive with --only-user.",
  },
  {
    flags: ["--only-user"],
    group: "Filters",
    description:
      "Search only user rows (exclude assistant and tool rows). " +
      "Mutually exclusive with --include-tools.",
  },
  {
    flags: ["--project"],
    placeholder: "SUBSTR",
    group: "Filters",
    description: "Filter by case-insensitive substring of project name or path.",
  },
  {
    flags: ["--since"],
    placeholder: "YYYY-MM-DD",
    group: "Filters",
    description: "Only include messages on or after this date.",
  },

  // Output
  {
    flags: ["--limit"],
    placeholder: "N",
    group: "Output",
    description: "Maximum conversations returned. Default: 20.",
  },
  {
    flags: ["--format"],
    placeholder: "text|tsv",
    group: "Output",
    description:
      "Output format. Default: text on a TTY, tsv when stdout is piped.",
  },
  {
    flags: ["--no-color"],
    group: "Output",
    description: "Disable ANSI color in text output.",
  },
  {
    flags: ["--preview"],
    placeholder: "SESSION_ID",
    group: "Output",
    description:
      "Render a turn-by-turn preview of the named session and exit (read-only).",
  },

  // Index management
  {
    flags: ["--db-path"],
    placeholder: "PATH",
    group: "Index management",
    description:
      "Override the index DB path. Default: " +
      "$XDG_DATA_HOME/krmrn42-skills/chat-search/index.db (or $CCSEARCH_DB if set).",
  },
  {
    flags: ["--reindex"],
    group: "Index management",
    description:
      "Force a full rebuild of the plugin-owned index from JSONL files, then exit. " +
      "Applies only to the plugin-owned index.",
  },
  {
    flags: ["--index-status"],
    group: "Index management",
    description:
      "Print index DB path, size, message and conversation counts, last-refresh " +
      "time, and any pending files. Applies only to the plugin-owned index.",
  },

  {
    flags: ["--print-names"],
    group: "Index management",
    description:
      "Print the picker config file (sessions.json — saved names AND pin list) to " +
      "stdout and exit. Read-only; emits `{}` when no config has been written yet. " +
      "Useful for backups or shell pipelines (e.g., `ccsearch --print-names | jq '.pins'`).",
  },
  {
    flags: ["--unpin-all"],
    group: "Index management",
    description:
      "Clear every pinned session (sessions.json.pins = []) and exit. Leaves saved " +
      "names untouched. Idempotent. Useful as a one-shot cleanup outside the picker.",
  },
  {
    flags: ["--no-tmux"],
    group: "Options",
    description:
      "Disable the picker's Ctrl-W keybinding even when running inside tmux. Use " +
      "this if your terminal setup (nested tmux, screen-inside-tmux, IDE-embedded " +
      "shell) confuses the tmux passthrough.",
  },

  // Dangerous
  {
    flags: ["--dangerously-skip-permissions"],
    group: "Dangerous",
    description:
      "Arm an Alt+Enter binding in the picker that resumes the selected " +
      "conversation with `claude --dangerously-skip-permissions`, skipping " +
      "every permission prompt in the resumed session. Plain Enter remains " +
      "safe. Shift+Enter works on CSI-u-aware terminals (Kitty, WezTerm, " +
      "iTerm2 with CSI-u, Windows Terminal w/ enhanced kb); on terminals " +
      "that send `\\r` for both Enter and Shift+Enter, Shift+Enter behaves " +
      "as plain Enter. No effect on one-shot text output.",
  },
];

const HELP_WIDTH = 80;
const HELP_FLAG_COL = 28;

function wrapText(text, width) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";
  for (const w of words) {
    if (cur.length === 0) {
      cur = w;
    } else if (cur.length + 1 + w.length <= width) {
      cur += " " + w;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

function formatOptionEntry(entry) {
  const flagPart = entry.flags.join(", ");
  return entry.placeholder ? flagPart + " " + entry.placeholder : flagPart;
}

function buildHelp() {
  const synopsis = [
    "usage: ccsearch [-h] [-i | -l] [--regex PAT] [--scan]",
    "                [--include-tools | --only-user]",
    "                [--project SUBSTR] [--since YYYY-MM-DD] [--limit N]",
    "                [--format text|tsv] [--no-color]",
    "                [--db-path PATH] [--preview SESSION_ID]",
    "                [--reindex | --index-status]",
    "                [query]",
  ];
  const description =
    "Relevance-ranked full-text search across local Claude Code conversations.";
  const positional = [
    "Positional arguments:",
    "  query                       FTS5 query (phrases \"…\", prefix term*, NEAR,",
    "                              AND/OR/NOT). Optional when -i, --regex --scan,",
    "                              --preview, --reindex, or --index-status is used.",
  ];

  // Render OPTIONS grouped, with wrapped descriptions.
  const optionsLines = [];
  const descWidth = HELP_WIDTH - HELP_FLAG_COL - 2; // 2 for the leading "  "
  let lastGroup = null;
  for (const opt of OPTIONS) {
    if (opt.group !== lastGroup) {
      if (lastGroup !== null) optionsLines.push("");
      optionsLines.push(opt.group + ":");
      lastGroup = opt.group;
    }
    const flagStr = formatOptionEntry(opt);
    const descLines = wrapText(opt.description, descWidth);
    if (flagStr.length + 1 > HELP_FLAG_COL) {
      // Flag column overflows — put description on the next line(s) instead.
      optionsLines.push("  " + flagStr);
      for (const line of descLines) {
        optionsLines.push("  " + " ".repeat(HELP_FLAG_COL) + line);
      }
    } else {
      optionsLines.push(
        "  " + flagStr.padEnd(HELP_FLAG_COL) + descLines[0]
      );
      for (let i = 1; i < descLines.length; i++) {
        optionsLines.push("  " + " ".repeat(HELP_FLAG_COL) + descLines[i]);
      }
    }
  }

  const examples = [
    "Examples:",
    '  ccsearch "session timeout"',
    "  ccsearch -i",
    '  ccsearch -i "regex parse"',
    `  ccsearch "auth" --regex 'TOKEN_[A-F0-9]{8}'`,
    `  ccsearch --regex 'TOKEN_[A-F0-9]{8}' --scan`,
    '  ccsearch "deploy" --project alpha --since 2026-04-01',
  ];
  const notes = [
    "Notes:",
    "  TSV columns:  session_id, project, project_path, date, messages_count,",
    "                snippet, score",
    "  Constraints:  --only-user and --include-tools are mutually exclusive;",
    "                --regex without a positional query requires --scan;",
    "                --reindex and --index-status apply only to the plugin-owned",
    "                index (cannot be combined with --db-path / $CCSEARCH_DB).",
    "  Exit codes:   0 success (zero matches is success); 1 user error (bad regex,",
    "                unparseable date, conflicting flags); 2 environment error",
    "                (DB missing, schema drift, unsupported Node, no TTY for -i);",
    "                3 internal error.",
    "  Runtime:      Node.js ≥ 22.5 (uses the built-in node:sqlite module).",
    "                No npm dependencies.",
  ];
  return [
    ...synopsis,
    "",
    description,
    "",
    ...positional,
    "",
    ...optionsLines,
    "",
    ...examples,
    "",
    ...notes,
  ].join("\n");
}

function parseArgs(argv) {
  const args = {
    query: "",
    interactive: false,
    list: false,
    regex: null,
    scan: false,
    includeTools: false,
    onlyUser: false,
    project: null,
    since: null,
    sinceTs: 0,
    limit: 20,
    format: null,
    dbPath: DEFAULT_DB,
    preview: null,
    noColor: false,
    help: false,
    reindex: false,
    indexStatus: false,
    dangerouslySkipPermissions: false,
    printNames: false,
    unpinAll: false,
    noTmux: false,
  };
  const rest = [];
  // Accept both `--flag value` (space-separated) and `--flag=value` (equals form).
  // Pre-split equals form so the switch below handles only the bare flag.
  const expanded = [];
  for (const a of argv) {
    if (a.startsWith("--") && a.length > 2 && a.includes("=")) {
      const eq = a.indexOf("=");
      expanded.push(a.slice(0, eq), a.slice(eq + 1));
    } else {
      expanded.push(a);
    }
  }
  for (let i = 0; i < expanded.length; i++) {
    const a = expanded[i];
    if (a === "--") {
      rest.push(...expanded.slice(i + 1));
      break;
    }
    // Long-form flag cases use `case "--flag":` on its own line. The drift-guard
    // test (ccsearch.test.sh) scans for that idiom to compare against --help.
    switch (a) {
      case "-h":
      case "--help":
        args.help = true;
        break;
      case "-i":
      case "--interactive":
        args.interactive = true;
        break;
      case "-l":
      case "--list":
        args.list = true;
        break;
      case "--regex":
        args.regex = expanded[++i];
        if (args.regex === undefined) dieUser("--regex requires a pattern");
        break;
      case "--scan":
        args.scan = true;
        break;
      case "--include-tools":
        args.includeTools = true;
        break;
      case "--only-user":
        args.onlyUser = true;
        break;
      case "--project":
        args.project = expanded[++i];
        if (args.project === undefined) dieUser("--project requires a substring");
        break;
      case "--since":
        args.since = expanded[++i];
        if (args.since === undefined) dieUser("--since requires YYYY-MM-DD");
        break;
      case "--limit":
        args.limit = Number(expanded[++i]);
        if (!Number.isFinite(args.limit) || args.limit <= 0) dieUser("--limit must be a positive integer");
        args.limit = Math.floor(args.limit);
        break;
      case "--format":
        args.format = expanded[++i];
        if (args.format !== "text" && args.format !== "tsv") {
          dieUser("--format must be 'text' or 'tsv'");
        }
        break;
      case "--db-path":
        args.dbPath = expanded[++i];
        if (args.dbPath === undefined) dieUser("--db-path requires a path");
        break;
      case "--preview":
        args.preview = expanded[++i];
        if (args.preview === undefined) dieUser("--preview requires a session id");
        break;
      case "--no-color":
        args.noColor = true;
        break;
      case "--reindex":
        args.reindex = true;
        break;
      case "--index-status":
        args.indexStatus = true;
        break;
      case "--dangerously-skip-permissions":
        args.dangerouslySkipPermissions = true;
        break;
      case "--print-names":
        args.printNames = true;
        break;
      case "--unpin-all":
        args.unpinAll = true;
        break;
      case "--no-tmux":
        args.noTmux = true;
        break;
      default:
        if (a.startsWith("--")) {
          dieUser(`unknown flag: ${a}`);
        }
        rest.push(a);
    }
  }
  if (args.help) {
    process.stdout.write(buildHelp() + "\n");
    process.exit(EXIT_OK);
  }
  if (args.list && args.interactive) {
    dieUser("--list and -i are mutually exclusive");
  }
  if (rest.length > 1) {
    args.query = rest.join(" ");
  } else if (rest.length === 1) {
    args.query = rest[0];
  }
  return args;
}

function validateArgs(args) {
  if (args.scan && !args.regex) dieUser("--scan requires --regex.");
  if (args.regex && !args.query && !args.scan) {
    dieUser(
      "--regex without a query requires --scan to acknowledge the full-table scan.\n" +
        "Either add an FTS query (e.g., `ccsearch \"keyword\" --regex 'pat'`) or pass --scan."
    );
  }
  if (args.includeTools && args.onlyUser) {
    dieUser("--only-user and --include-tools cannot be combined.");
  }
  if (args.regex) {
    try {
      args.regexCompiled = new RegExp(args.regex, "m");
    } catch (e) {
      dieUser(`--regex: invalid pattern: ${e.message}`);
    }
  } else {
    args.regexCompiled = null;
  }
  args.sinceTs = args.since ? parseSince(args.since) : 0;
  // args.format is intentionally NOT resolved here. selectMode reads
  // `args.format !== null` as the "user explicitly set --format" signal,
  // which must remain falsy when the user did not pass --format. The
  // one-shot branch in main() resolves the default before rendering.
}

// selectMode decides whether to dispatch to the TUI picker or one-shot
// rendering. Pure function; stdio is injected so it's unit-testable.
// Special short-circuits (--preview / --reindex / --index-status) are
// handled by main() before this function is called.
function selectMode(args, stdio) {
  if (args.list) return "one-shot";
  if (args.format !== null) return "one-shot";
  if (args.regex) return "one-shot";
  if (args.interactive) return "picker";
  if (!stdio.stdinTTY || !stdio.stdoutTTY) return "one-shot";
  return "picker";
}

// --- Main ----------------------------------------------------------------

function runOneShot(db, args) {
  let results;
  if (args.scan) {
    results = regexScan(db, args, args.regexCompiled);
  } else if (args.regex) {
    if (!args.query) dieUser("internal: regex without query without scan reached search path");
    results = regexPostfilter(db, args, args.regexCompiled);
  } else {
    if (!args.query) {
      dieUser(
        "no query provided.\n" +
          'Try: ccsearch "some keyword"   (on a TTY, bare `ccsearch` opens the picker)\n' +
          "Run `ccsearch --help` for the full flag reference."
      );
    }
    results = ftsSearch(db, args);
  }
  const useColor = process.stdout.isTTY && !args.noColor;
  if (args.format === "tsv") {
    renderTsv(results);
  } else {
    renderText(results, useColor);
  }
}

async function main(argv) {
  const args = parseArgs(argv);
  validateArgs(args);

  // --print-names is a read-only short-circuit. No DB, no index work; just
  // dump the JSON file (or `{}` when none exists) and exit 0.
  if (args.printNames) {
    const p = sessionsConfigPath();
    let body;
    try {
      body = fs.readFileSync(p, "utf8");
    } catch (e) {
      if (e && e.code === "ENOENT") {
        process.stdout.write("{}\n");
        return EXIT_OK;
      }
      throw e;
    }
    if (!body.endsWith("\n")) body += "\n";
    process.stdout.write(body);
    return EXIT_OK;
  }

  // --unpin-all clears sessions.json.pins and exits. Leaves names untouched.
  // Creates the file when missing (matches the pin-toggle write contract).
  if (args.unpinAll) {
    const store = loadSessionStore();
    const oldLen = store.pins.length;
    store.pins = [];
    saveSessionStore(store);
    process.stdout.write(`ccsearch: cleared ${oldLen} pin${oldLen === 1 ? "" : "s"}\n`);
    return EXIT_OK;
  }

  const usingPluginOwned = isPluginOwnedDb(args.dbPath);
  // Plugin-owned DB needs write access for the indexer pass that runs on every startup.
  const db = openDb(args.dbPath, { readWrite: usingPluginOwned });

  // For the plugin-owned index, ensure schema exists before probeSchema runs
  // against an otherwise-empty DB.
  if (usingPluginOwned) {
    const indexer = require("./indexer.js");
    indexer.ensureSchema(db);
  }

  probeSchema(db);

  // --index-status: short-circuit before any indexing or query work.
  if (args.indexStatus) {
    const indexer = require("./indexer.js");
    const status = indexer.getIndexStatus(db, args.dbPath);
    process.stdout.write(indexer.renderIndexStatus(status));
    return EXIT_OK;
  }

  // Refresh / full-rebuild for the plugin-owned index.
  if (usingPluginOwned) {
    const indexer = require("./indexer.js");
    if (args.reindex) {
      await indexer.fullReindex(db);
    } else {
      await indexer.runIndexer(db);
    }

    // Empty index + empty disk = friendly nudge.
    const counts = db.prepare("SELECT COUNT(*) AS c FROM messages").get();
    if (!counts || counts.c === 0) {
      const projects = indexer.projectsRoot();
      const files = indexer.listJsonlFiles(projects);
      if (files.length === 0) {
        dieEnv(
          `no past conversations on disk — use Claude Code at least once to populate ${projects}, ` +
            `or pass --db-path to a different SQLite FTS5 index.`
        );
      }
    }

    // --reindex without a query is a no-op exit after the rebuild.
    if (args.reindex && !args.query && !args.interactive && !args.preview) {
      const c = db.prepare("SELECT COUNT(*) AS c, COUNT(DISTINCT conversation_id) AS conv, COUNT(DISTINCT project_path) AS proj FROM messages").get();
      process.stderr.write(
        `ccsearch: indexed ${(c.c || 0).toLocaleString()} messages across ${(c.conv || 0).toLocaleString()} conversations / ${c.proj || 0} projects\n`
      );
      return EXIT_OK;
    }
  } else if (args.reindex || args.indexStatus) {
    dieUser("--reindex and --index-status apply only to the plugin-owned index. Remove --db-path / CCSEARCH_DB to use them.");
  }

  args.sinceTs *= detectTimestampScale(db);

  const useColor = process.stdout.isTTY && !args.noColor;

  if (args.preview) {
    renderPreview(db, args.preview, useColor);
    return EXIT_OK;
  }

  const mode = selectMode(args, {
    stdinTTY: !!process.stdin.isTTY,
    stdoutTTY: !!process.stdout.isTTY,
  });

  if (mode === "picker") {
    // Load sessions.json once at picker startup. The picker mutates this
    // in-memory copy on rename / clear, and persists via saveSessionStore.
    // Picker-session-scoped: not re-read mid-session.
    const sessionStore = loadSessionStore();
    const runPicker = require("./picker.js");
    const result = await runPicker({
      db,
      args,
      ftsSearch,
      recentConversations,
      projectDisplay,
      shortSession,
      fmtDate,
      colorizeSnippet,
      resumeOneLiner,
      isExistingDir,
      renderPreview,
      ANSI_BOLD,
      ANSI_DIM,
      ANSI_RESET,
      EXIT_OK,
      EXIT_ENV,
      dangerouslySkipPermissions: args.dangerouslySkipPermissions,
      sessionStore,
      saveSessionStore,
      // Tmux availability is computed once at startup. The user's $TMUX env
      // var being set means we're inside tmux; --no-tmux is the kill switch.
      tmuxAvailable: !!process.env.TMUX && !args.noTmux,
    });
    return result;
  }

  // One-shot: resolve default format now if the user didn't explicitly set it.
  if (args.format === null) {
    args.format = process.stdout.isTTY ? "text" : "tsv";
  }
  runOneShot(db, args);
  return EXIT_OK;
}

if (require.main === module) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((e) => {
      if (e && e.code === "SQLITE_READONLY") {
        process.stderr.write(`ccsearch: ${e.message}\n`);
        process.exit(EXIT_INTERNAL);
      }
      process.stderr.write(
        `ccsearch: internal error: ${e && e.stack ? e.stack : e}\n`
      );
      process.exit(EXIT_INTERNAL);
    });
}

// Test-only exports. Guarded so production behavior is unaffected; the tests
// in bin/ccsearch.test.sh set CCSEARCH_TEST=1 before requiring this file.
if (process.env.CCSEARCH_TEST) {
  module.exports = {
    parseArgs,
    selectMode,
    recentConversations,
    isWrapperContent,
    synthesizeTitle,
    normalizeTailContent,
    WRAPPER_TAGS,
    sessionsConfigPath,
    loadSessionStore,
    saveSessionStore,
    emptySessionStore,
    applyPinOrdering,
  };
}
