import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { detectMigrationNeeded } from "../../src/core/schema.js";
import { runMigrations, ensureSchema } from "../../src/indexer/state.js";

test("fresh DB → no migration needed", () => {
  const db = new DatabaseSync(":memory:");
  assert.equal(detectMigrationNeeded(db), 0);
});

test("legacy schema (no source column) → migration v2 needed", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      project_path TEXT NOT NULL,
      project_name TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      type TEXT NOT NULL,
      content TEXT,
      message_uuid TEXT NOT NULL,
      parent_uuid TEXT
    );
  `);
  assert.equal(detectMigrationNeeded(db), 2);
});

test("v2 schema (with source, no subtype) → migration v3 needed", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      project_path TEXT NOT NULL,
      project_name TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      type TEXT NOT NULL,
      content TEXT,
      message_uuid TEXT NOT NULL,
      parent_uuid TEXT,
      source TEXT NOT NULL DEFAULT 'claude'
    );
  `);
  assert.equal(detectMigrationNeeded(db), 3);
});

test("v3 schema (has subtype) → no migration needed", () => {
  const db = new DatabaseSync(":memory:");
  db["exec"](`
    CREATE TABLE messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      project_path TEXT NOT NULL,
      project_name TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      type TEXT NOT NULL,
      content TEXT,
      message_uuid TEXT NOT NULL,
      parent_uuid TEXT,
      source TEXT NOT NULL DEFAULT 'claude',
      subtype TEXT NULL,
      git_branch TEXT NULL,
      attribution_skill TEXT NULL
    );
  `);
  assert.equal(detectMigrationNeeded(db), 0);
});

test("runMigrations: v2 db is migrated to v3 (subtype column appears)", () => {
  const db = new DatabaseSync(":memory:");
  db["exec"](`
    CREATE TABLE messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      project_path TEXT NOT NULL,
      project_name TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      type TEXT NOT NULL,
      content TEXT,
      message_uuid TEXT NOT NULL,
      parent_uuid TEXT,
      source TEXT NOT NULL DEFAULT 'claude'
    );
    INSERT INTO messages (id, conversation_id, project_path, project_name,
      timestamp, type, content, message_uuid, parent_uuid)
    VALUES ('row1','conv','/p','p',1,'user','hi','u1',NULL);
  `);
  assert.equal(detectMigrationNeeded(db), 3);

  runMigrations(db, true);
  ensureSchema(db);

  const rowCount = db.prepare("SELECT COUNT(*) AS c FROM messages").get() as { c: number };
  assert.equal(rowCount.c, 0);

  const cols = (db.prepare("PRAGMA table_info(messages)").all() as Array<{ name: string }>)
    .map((c) => c.name);
  assert.ok(cols.includes("subtype"), "subtype column should exist after migration");
  assert.ok(cols.includes("git_branch"));
  assert.ok(cols.includes("attribution_skill"));

  assert.equal(detectMigrationNeeded(db), 0);
});
