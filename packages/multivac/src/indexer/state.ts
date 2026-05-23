import type { DatabaseSync } from "node:sqlite";
import { SCHEMA_SQL } from "../core/schema.js";
import { detectMigrationNeeded } from "../core/schema.js";

export function ensureSchema(db: DatabaseSync): void {
  try {
    db["exec"]("PRAGMA journal_mode = WAL;");
  } catch (_) {
    // older node:sqlite builds may not allow PRAGMA via the multi-statement runner; ignore.
  }
  db["exec"](SCHEMA_SQL);
}

export interface IndexerState {
  mtimeMs: number;
  rows: number;
  indexedAt: number;
}

export function getState(db: DatabaseSync, sourceId: string, jsonlPath: string): IndexerState | null {
  const row = db
    .prepare("SELECT mtime_ms, rows, indexed_at FROM _indexer_state WHERE jsonl_path = ? AND source = ?")
    .get(jsonlPath, sourceId) as { mtime_ms: number; rows: number; indexed_at: number } | undefined;
  if (!row) return null;
  return { mtimeMs: row.mtime_ms, rows: row.rows, indexedAt: row.indexed_at };
}

export function setState(
  db: DatabaseSync,
  sourceId: string,
  jsonlPath: string,
  mtimeMs: number,
  rows: number
): void {
  db
    .prepare(
      "INSERT INTO _indexer_state (jsonl_path, mtime_ms, rows, indexed_at, source) " +
        "VALUES (?, ?, ?, ?, ?) " +
        "ON CONFLICT(jsonl_path) DO UPDATE SET mtime_ms=excluded.mtime_ms, rows=excluded.rows, indexed_at=excluded.indexed_at, source=excluded.source"
    )
    .run(jsonlPath, mtimeMs, rows, Date.now(), sourceId);
}

export function runMigrations(db: DatabaseSync, silent: boolean): void {
  const needed = detectMigrationNeeded(db);
  if (needed === 0) return;
  if (needed === 2) {
    if (!silent) {
      process.stderr.write(
        "multivac: index schema migration v2 (adding `source` column). " +
          "This triggers a one-time full reindex; subsequent runs are incremental.\n"
      );
    }
    db["exec"]("DROP TABLE IF EXISTS messages_fts;");
    db["exec"]("DROP TABLE IF EXISTS messages;");
    db["exec"]("DROP TABLE IF EXISTS _indexer_state;");
    // Schema bootstrap (next ensureSchema call) recreates with v2 layout.
  }
}
