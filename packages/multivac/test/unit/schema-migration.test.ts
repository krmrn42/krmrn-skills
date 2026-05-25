import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { detectMigrationNeeded } from "../../src/core/schema.js";

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

test("current schema (with source) → no migration needed", () => {
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
  assert.equal(detectMigrationNeeded(db), 0);
});
