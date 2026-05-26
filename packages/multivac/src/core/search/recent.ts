import type { DatabaseSync } from "node:sqlite";
import type { ResultRow, SessionStore } from "../types.js";
import { applyPinOrdering } from "./pin-ordering.js";
import { getRecapText } from "./recap.js";

// Wrapper tags Claude Code uses to embed non-user content inside a
// `type: 'user'` JSONL row. When synthesizing a conversation title we skip
// over these to find the real first user message. Tail snippets (the "where
// did I leave off" line) intentionally do NOT strip wrappers — see
// design.md §Decision 3.
//
// Validated by scanning ~412 real user messages across recent JSONL fixtures.
// Most common: <local-command-caveat>, <command-name>, <local-command-stdout>.
export const WRAPPER_TAGS = new Set([
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

export function isWrapperContent(s: string | null | undefined): boolean {
  if (!s) return true;
  const trimmed = s.replace(/^\s+/, "");
  const m = trimmed.match(/^<([a-zA-Z0-9_-]+)>/);
  if (!m) return false;
  return WRAPPER_TAGS.has(m[1]);
}

export function synthesizeTitle(rawContent: string | null | undefined): string | null {
  if (!rawContent) return null;
  const firstLine = rawContent.split("\n", 1)[0].replace(/\s+/g, " ").trim();
  if (firstLine.length === 0) return null;
  const CAP = 80;
  return firstLine.length > CAP ? firstLine.slice(0, CAP) + "…" : firstLine;
}

export function normalizeTailContent(rawContent: string | null | undefined): string {
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

export interface RecentConversationsOpts {
  limit: number;
  projectFilter: string | null;
  /**
   * v0.8.1: when set, restrict to chats whose `project_path` matches exactly.
   * Used by `buildProjectGroups` to fetch a single project's recent chats
   * without the substring fuzziness that `projectFilter` introduces (which can
   * match neighbouring paths like `/work/frontend-v2` for `/work/frontend`).
   * Mutually exclusive with `projectFilter`; if both are set, exact wins.
   */
  exactProjectPath?: string;
  sessionStore?: SessionStore | null;
}

export function recentConversations(db: DatabaseSync, opts: RecentConversationsOpts): ResultRow[] {
  const { limit, projectFilter, exactProjectPath, sessionStore } = opts;

  // Step 1: most recent conversations across all (or one) projects.
  let projectExtra = "";
  let projectParams: string[] = [];
  if (exactProjectPath) {
    projectExtra = "AND project_path = ?";
    projectParams = [exactProjectPath];
  } else if (projectFilter) {
    projectExtra = "AND (LOWER(project_name) LIKE ? OR LOWER(project_path) LIKE ?)";
    projectParams = [
      "%" + String(projectFilter).toLowerCase() + "%",
      "%" + String(projectFilter).toLowerCase() + "%",
    ];
  }
  const recentSql = `
SELECT
  conversation_id AS conversation_id,
  MAX(source) AS source,
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
    .all(...projectParams, Math.max(1, limit | 0)) as Array<{
      conversation_id: string;
      source: string;
      project_path: string | null;
      project_name: string | null;
      last_ts: number | null;
      msg_count: number;
    }>;

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
  // Step 4: v0.8 metadata (git_branch, attribution_skill from most recent row).
  const metaStmt = db.prepare(
    "SELECT git_branch, attribution_skill FROM messages " +
      "WHERE conversation_id = ? " +
      "ORDER BY timestamp DESC LIMIT 1"
  );

  // Saved-name overlay: when a sessionStore is passed and has a name for
  // this conversation_id, it overrides the synthesized title. Synthesis still
  // runs for rows without a saved name (existing recent-browse behavior).
  const namesMap = (sessionStore && sessionStore.names) || {};

  const results: ResultRow[] = [];
  for (const conv of recent) {
    const source = conv.source || "claude";
    const nameKey = `${source}:${conv.conversation_id}`;

    let title: string | null = null;
    const saved = namesMap[nameKey];
    if (typeof saved === "string" && saved.length > 0) {
      title = saved;
    } else {
      const candidates = titleStmt.all(conv.conversation_id) as Array<{ content: string | null }>;
      for (const c of candidates) {
        if (!c.content) continue;
        if (isWrapperContent(c.content)) continue;
        title = synthesizeTitle(c.content);
        if (title) break;
      }
    }
    const tailRow = tailStmt.get(conv.conversation_id) as { content: string | null } | undefined;
    const tail = tailRow ? normalizeTailContent(tailRow.content) : "";

    const recapText = getRecapText(db, conv.conversation_id, source);
    const metaRow = metaStmt.get(conv.conversation_id) as
      { git_branch: string | null; attribution_skill: string | null } | undefined;

    results.push({
      kind: "chat",
      source,
      sessionId: conv.conversation_id,
      projectPath: conv.project_path || "",
      projectName: conv.project_name || "",
      lastActivity: conv.last_ts || 0,
      msgCount: conv.msg_count || 0,
      snippet: tail,
      score: 0,
      title,
      recapText,
      gitBranch: metaRow?.git_branch ?? null,
      skill: metaRow?.attribution_skill ?? null,
    });
  }
  // Pinned rows (from sessionStore.pins) sort to the top in pin-order. Rows
  // not in the SQL recent-N don't get injected here — pinning promotes
  // within the result set, not above it.
  return applyPinOrdering(results, sessionStore, Math.max(1, limit | 0));
}
