import type { DatabaseSync } from "node:sqlite";
import type { ProjectHeader } from "../types.js";
import { synthesizeTitle, isWrapperContent } from "./recent.js";

export interface SearchProjectsOpts {
  limit: number;
  projectFilter: string | null;
}

interface ProjectAggRow {
  project_path: string;
  project_name: string | null;
  chat_count: number;
  last_activity: number;
}

interface TopChatRow {
  conversation_id: string;
}

/**
 * SQL-derived project results. Aggregates by `project_path`, counting distinct
 * conversations and tracking the most recent activity timestamp. Optional
 * case-insensitive substring filter on path OR name.
 *
 * Spec: docs/superpowers/specs/2026-05-24-multivac-dashboard-design.md §D8.
 */
export function searchProjects(
  db: DatabaseSync,
  opts: SearchProjectsOpts,
): ProjectHeader[] {
  const { limit, projectFilter } = opts;
  const filterClause = projectFilter
    ? "AND (LOWER(project_path) LIKE ? OR LOWER(project_name) LIKE ?)"
    : "";
  const filterParams = projectFilter
    ? [
        "%" + projectFilter.toLowerCase() + "%",
        "%" + projectFilter.toLowerCase() + "%",
      ]
    : [];
  // `is_subagent = 0` excludes machine-launched JSONLs (subagent transcripts,
  // SDK-CLI sessions, sidechains) from project aggregation — spec §D15.
  const aggSql = `
SELECT
  project_path,
  MAX(project_name) AS project_name,
  COUNT(DISTINCT conversation_id) AS chat_count,
  MAX(timestamp) AS last_activity
FROM messages
WHERE type IN ('user', 'assistant') AND is_subagent = 0
${filterClause}
GROUP BY project_path
ORDER BY last_activity DESC
LIMIT ?
`;
  const rows = db
    .prepare(aggSql)
    .all(...filterParams, Math.max(1, limit | 0)) as unknown as ProjectAggRow[];

  const topStmt = db.prepare(
    "SELECT conversation_id FROM messages " +
      "WHERE project_path = ? AND type IN ('user', 'assistant') " +
      "AND is_subagent = 0 " +
      "GROUP BY conversation_id " +
      "ORDER BY MAX(timestamp) DESC LIMIT 3"
  );
  const titleStmt = db.prepare(
    "SELECT content FROM messages " +
      "WHERE conversation_id = ? AND type = 'user' " +
      "ORDER BY timestamp ASC LIMIT 5"
  );

  const out: ProjectHeader[] = [];
  for (const r of rows) {
    const tops = topStmt.all(r.project_path) as unknown as TopChatRow[];
    const titles: string[] = [];
    for (const t of tops) {
      const cands = titleStmt.all(t.conversation_id) as Array<{ content: string | null }>;
      let title: string | null = null;
      for (const c of cands) {
        if (!c.content) continue;
        if (isWrapperContent(c.content)) continue;
        title = synthesizeTitle(c.content);
        if (title) break;
      }
      titles.push(title ?? t.conversation_id.slice(0, 8));
    }
    out.push({
      kind: "project",
      projectPath: r.project_path,
      projectName: r.project_name ?? r.project_path.split("/").pop() ?? "?",
      chatCount: r.chat_count,
      lastActivity: r.last_activity ?? 0,
      topChatTitles: titles,
    });
  }
  return out;
}
