import type { DatabaseSync } from "node:sqlite";

export const EXPECTED_TABLES = new Set(["messages", "messages_fts"]);

// Includes the new `source` column added by P1 migration v2.
export const EXPECTED_COLUMNS = new Set([
  "id", "conversation_id", "project_path", "project_name",
  "timestamp", "type", "content", "message_uuid", "parent_uuid",
  "source",
]);

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  project_path    TEXT NOT NULL,
  project_name    TEXT NOT NULL,
  timestamp       INTEGER NOT NULL,
  type            TEXT NOT NULL,
  content         TEXT,
  message_uuid    TEXT NOT NULL,
  parent_uuid     TEXT,
  source          TEXT NOT NULL DEFAULT 'claude'
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp    ON messages(timestamp);
CREATE INDEX IF NOT EXISTS idx_messages_type         ON messages(type);
CREATE INDEX IF NOT EXISTS idx_messages_source       ON messages(source);
CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(id UNINDEXED, content);
CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(id, content) VALUES (new.id, COALESCE(new.content, ''));
END;
CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
  DELETE FROM messages_fts WHERE id = old.id;
END;
CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN
  DELETE FROM messages_fts WHERE id = old.id;
  INSERT INTO messages_fts(id, content) VALUES (new.id, COALESCE(new.content, ''));
END;
CREATE TABLE IF NOT EXISTS _indexer_state (
  jsonl_path TEXT PRIMARY KEY,
  mtime_ms   INTEGER NOT NULL,
  rows       INTEGER NOT NULL,
  indexed_at INTEGER NOT NULL,
  source     TEXT NOT NULL DEFAULT 'claude'
);
`;

// detectMigrationNeeded returns the migration version we need to run, or 0 if
// the schema is current. The only check P1 cares about is the presence of the
// `source` column on `messages`.
export function detectMigrationNeeded(db: DatabaseSync): number {
  const tables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='messages'"
  ).all();
  if (tables.length === 0) return 0; // fresh DB, schema bootstrap will create it
  const cols = db.prepare("PRAGMA table_info(messages)").all() as Array<{ name: string }>;
  const hasSource = cols.some((c) => c.name === "source");
  return hasSource ? 0 : 2; // 2 = "add source column" migration
}
