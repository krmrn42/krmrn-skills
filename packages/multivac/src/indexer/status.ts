import * as fs from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { ensureSchema } from "./state.js";
import { getRegistry } from "../sources/registry.js";

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function formatTime(unixMs: number): string {
  if (!unixMs) return "never";
  const d = new Date(unixMs);
  return d.toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

export interface IndexStatus {
  dbPath: string;
  size: number;
  messages: number;
  conversations: number;
  projects: number;
  lastPassMs: number;
  freshestMs: number;
  pendingFiles: number;
  pendingBytes: number;
}

export async function getIndexStatus(db: DatabaseSync, dbPath: string): Promise<IndexStatus> {
  ensureSchema(db);
  const counts = db
    .prepare(
      "SELECT (SELECT COUNT(*) FROM messages) AS messages, " +
        "       (SELECT COUNT(DISTINCT conversation_id) FROM messages) AS conversations, " +
        "       (SELECT COUNT(DISTINCT project_path) FROM messages) AS projects, " +
        "       (SELECT MAX(indexed_at) FROM _indexer_state) AS last_pass, " +
        "       (SELECT MAX(mtime_ms) FROM _indexer_state) AS max_mtime_ms"
    )
    .get() as {
    messages: number;
    conversations: number;
    projects: number;
    last_pass: number | null;
    max_mtime_ms: number | null;
  };

  // Gather all SourceFiles from all registered sources.
  const allFiles: Array<{ path: string; mtimeMs: number }> = [];
  for (const source of getRegistry()) {
    const files = await source.discover();
    allFiles.push(...files);
  }

  const stateMap = new Map<string, number>(
    (db.prepare("SELECT jsonl_path, mtime_ms FROM _indexer_state").all() as Array<{ jsonl_path: string; mtime_ms: number }>).map(
      (r) => [r.jsonl_path, r.mtime_ms]
    )
  );
  let pendingFiles = 0;
  let pendingBytes = 0;
  let freshestMs = 0;
  for (const f of allFiles) {
    const ms = f.mtimeMs;
    if (ms > freshestMs) freshestMs = ms;
    const prev = stateMap.get(f.path) ?? 0;
    if (ms > prev) {
      pendingFiles++;
      try {
        const st = fs.statSync(f.path);
        pendingBytes += Number(st.size);
      } catch (_) {
        // file may have disappeared between discover and stat
      }
    }
  }

  const size = (() => {
    try {
      return fs.statSync(dbPath).size;
    } catch (_) {
      return 0;
    }
  })();

  return {
    dbPath,
    size,
    messages: counts.messages || 0,
    conversations: counts.conversations || 0,
    projects: counts.projects || 0,
    lastPassMs: counts.last_pass || 0,
    freshestMs,
    pendingFiles,
    pendingBytes,
  };
}

export function renderIndexStatus(st: IndexStatus): string {
  const lines: string[] = [];
  lines.push(`index path: ${st.dbPath}`);
  lines.push(`size:       ${formatBytes(st.size)}`);
  lines.push(
    `messages:   ${st.messages.toLocaleString()} across ${st.conversations.toLocaleString()} conversations / ${st.projects} projects`
  );
  lines.push(`last pass:  ${formatTime(st.lastPassMs)}`);
  lines.push(`freshest:   ${formatTime(st.freshestMs)}`);
  if (st.pendingFiles === 0) {
    lines.push(`pending:    none`);
  } else {
    lines.push(
      `pending:    ${st.pendingFiles} file${st.pendingFiles === 1 ? "" : "s"} / ${formatBytes(st.pendingBytes)} — will be indexed on next multivac run`
    );
  }
  return lines.join("\n") + "\n";
}
