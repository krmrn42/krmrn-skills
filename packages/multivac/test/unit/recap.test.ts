import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { ensureSchema } from "../../src/indexer/state.js";
import { getRecapText } from "../../src/core/search/recap.js";

function seedDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  ensureSchema(db);
  return db;
}

function insertRow(
  db: DatabaseSync,
  opts: { id: string; conv: string; ts: number; type: string;
          content: string; subtype?: string; source?: string }
) {
  db.prepare(
    "INSERT INTO messages (id, conversation_id, project_path, project_name, " +
      "timestamp, type, content, message_uuid, parent_uuid, source, subtype) " +
      "VALUES (?, ?, '/p', 'p', ?, ?, ?, ?, NULL, ?, ?)"
  ).run(opts.id, opts.conv, opts.ts, opts.type, opts.content,
        opts.id, opts.source ?? "claude", opts.subtype ?? null);
}

test("getRecapText: returns away_summary when it's the latest text", () => {
  const db = seedDb();
  insertRow(db, { id: "1", conv: "c", ts: 100, type: "user", content: "Q1" });
  insertRow(db, { id: "2", conv: "c", ts: 200, type: "assistant", content: "A1" });
  insertRow(db, { id: "3", conv: "c", ts: 300, type: "system",
                  subtype: "away_summary", content: "RECAP" });
  assert.equal(getRecapText(db, "c", "claude"), "RECAP");
});

test("getRecapText: falls back to head of last assistant when away_summary is stale", () => {
  const db = seedDb();
  insertRow(db, { id: "1", conv: "c", ts: 100, type: "system",
                  subtype: "away_summary", content: "OLD RECAP" });
  insertRow(db, { id: "2", conv: "c", ts: 200, type: "user", content: "Q1" });
  insertRow(db, { id: "3", conv: "c", ts: 300, type: "assistant",
                  content: "line1\nline2\nline3\nline4\nline5\nline6\nline7" });
  const out = getRecapText(db, "c", "claude");
  assert.equal(out, "line1\nline2\nline3\nline4\nline5");
});

test("getRecapText: returns empty string when no assistant + no away_summary", () => {
  const db = seedDb();
  insertRow(db, { id: "1", conv: "c", ts: 100, type: "user", content: "Q1" });
  assert.equal(getRecapText(db, "c", "claude"), "");
});

test("getRecapText: away_summary fresh (no later user message) wins", () => {
  const db = seedDb();
  insertRow(db, { id: "1", conv: "c", ts: 100, type: "user", content: "Q1" });
  insertRow(db, { id: "2", conv: "c", ts: 200, type: "assistant", content: "A1" });
  insertRow(db, { id: "3", conv: "c", ts: 300, type: "system",
                  subtype: "away_summary", content: "FRESH RECAP" });
  assert.equal(getRecapText(db, "c", "claude"), "FRESH RECAP");
});
