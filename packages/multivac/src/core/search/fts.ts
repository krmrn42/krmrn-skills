import type { DatabaseSync } from "node:sqlite";
import type { Args, ResultRow, SessionStore } from "../types.js";
import { SNIPPET_OPEN, SNIPPET_CLOSE } from "../format.js";
import { applyPinOrdering } from "./pin-ordering.js";
import { dieUser } from "../../cli/exit-codes.js";

interface TypeClause { sql: string; params: string[]; }

export function typeFilterClause(includeTools: boolean, onlyUser: boolean): TypeClause {
  if (onlyUser) return { sql: "m.type = ?", params: ["user"] };
  if (includeTools)
    return { sql: "m.type IN (?, ?, ?, ?)", params: ["user", "assistant", "tool_use", "tool_result"] };
  return { sql: "m.type IN (?, ?)", params: ["user", "assistant"] };
}

export function dieFts(query: string, err: Error): never {
  const msg = err.message || String(err);
  if (/no such column|fts5|syntax error/i.test(msg)) {
    let suggestion = "";
    if (query.includes("-") && !(query.startsWith('"') && query.endsWith('"'))) {
      suggestion =
        `\nFTS5 treats '-' as NOT and '"…"' as a phrase. ` +
        `To search for the literal phrase, quote it:\n    multivac '"${query}"'`;
    }
    dieUser(`FTS5 query error: ${msg}${suggestion}`);
  }
  dieUser(`FTS5 query error: ${msg}`);
}

export interface WhereExtras { sql: string; params: (string | number)[]; }

export function buildWhereExtras(args: Args): WhereExtras {
  const extras: string[] = [];
  const params: (string | number)[] = [];
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

export function fillMeta(db: DatabaseSync, results: ResultRow[]): ResultRow[] {
  const stmt = db.prepare(
    "SELECT COUNT(*) AS c, MAX(timestamp) AS t FROM messages WHERE conversation_id = ? AND source = ?"
  );
  for (const r of results) {
    const row = stmt.get(r.sessionId, r.source) as { c: number; t: number } | undefined;
    r.msgCount = row?.c ?? 0;
    r.lastActivity = row?.t ?? 0;
  }
  return results;
}

export interface FtsSearchArgs extends Args {
  sessionStore?: SessionStore | null;
}

export function ftsSearch(db: DatabaseSync, args: FtsSearchArgs): ResultRow[] {
  const { sql: typeSql, params: typeParams } = typeFilterClause(args.includeTools, args.onlyUser);
  const { sql: whereExtraSql, params: extraParams } = buildWhereExtras(args);
  const innerLimit = Math.max(args.limit * 50, 500);

  // `m.is_subagent = 0` excludes machine-launched JSONLs (subagent transcripts,
  // SDK-CLI sessions, sidechains) from FTS results — spec §D15.
  const sql = `
SELECT
  m.source AS source,
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
  AND m.is_subagent = 0
  ${whereExtraSql}
ORDER BY bm25(messages_fts)
LIMIT ?
`;
  const params = [SNIPPET_OPEN, SNIPPET_CLOSE, args.query, ...typeParams, ...extraParams, innerLimit];
  let rows: any[];
  try { rows = db.prepare(sql).all(...params); }
  catch (e: any) { dieFts(args.query, e); }

  const seen = new Map<string, ResultRow>();
  for (const r of rows) {
    const key = `${r.source}:${r.conversation_id}`;
    if (seen.has(key)) continue;
    seen.set(key, {
      kind: "chat",
      source: r.source,
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
  const filled = fillMeta(db, [...seen.values()]);
  return applyPinOrdering(filled, args.sessionStore, args.limit);
}
