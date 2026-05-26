import type { DatabaseSync } from "node:sqlite";
import type { Args, ResultRow } from "../types.js";
import { SNIPPET_OPEN, SNIPPET_CLOSE } from "../format.js";
import { typeFilterClause, buildWhereExtras, fillMeta, dieFts } from "./fts.js";

export function regexPostfilter(db: DatabaseSync, args: Args, pattern: RegExp): ResultRow[] {
  const { sql: typeSql, params: typeParams } = typeFilterClause(args.includeTools, args.onlyUser);
  const { sql: whereExtraSql, params: extraParams } = buildWhereExtras(args);

  const sql = `
SELECT
  m.source AS source,
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

  let rows: any[];
  try {
    rows = db.prepare(sql).all(...params);
  } catch (e: any) {
    dieFts(args.query, e);
  }
  const seen = new Map<string, ResultRow>();
  for (const r of rows) {
    const key = `${r.source}:${r.conversation_id}`;
    if (seen.has(key)) continue;
    if (!r.content || !pattern.test(r.content)) continue;
    seen.set(key, {
      kind: "chat" as const,
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
  return fillMeta(db, [...seen.values()]);
}

export function regexScan(db: DatabaseSync, args: Args, pattern: RegExp): ResultRow[] {
  const { sql: typeSql, params: typeParams } = typeFilterClause(args.includeTools, args.onlyUser);
  const { sql: whereExtraSql, params: extraParams } = buildWhereExtras(args);

  const totalRow = db
    .prepare(`SELECT COUNT(*) AS c FROM messages m WHERE ${typeSql} ${whereExtraSql}`)
    .get(...typeParams, ...extraParams) as { c: number } | undefined;
  const total = totalRow ? totalRow.c : 0;
  const progressThreshold = 50_000;
  const progressInterval = 10_000;
  const progressEnabled = total > progressThreshold && process.stderr.isTTY;

  if (progressEnabled) {
    process.stderr.write(`multivac: scanning ${total.toLocaleString()} messages…\n`);
  }

  const sql = `
SELECT m.source AS source, m.conversation_id AS conversation_id, m.project_path AS project_path,
       m.project_name AS project_name, m.timestamp AS timestamp, m.content AS content
FROM messages m
WHERE ${typeSql}
${whereExtraSql}
ORDER BY m.timestamp DESC
`;
  const iter = db.prepare(sql).iterate(...typeParams, ...extraParams);

  const seen = new Map<string, ResultRow>();
  let scanned = 0;
  for (const r of iter as Iterable<any>) {
    scanned++;
    if (progressEnabled && scanned % progressInterval === 0) {
      process.stderr.write(`multivac: scanned ${scanned.toLocaleString()}/${total.toLocaleString()}…\n`);
    }
    const key = `${r.source}:${r.conversation_id}`;
    if (seen.has(key)) continue;
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
    seen.set(key, {
      kind: "chat" as const,
      source: r.source,
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
