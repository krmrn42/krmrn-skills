import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { ensureSchema } from "../../src/indexer/state.js";
import { recentConversations } from "../../src/core/search/recent.js";

function seed(db: DatabaseSync, rows: Array<{ id: string; conv: string; ts: number;
  type: string; content: string; subtype?: string; gitBranch?: string; skill?: string }>) {
  for (const r of rows) {
    db.prepare(
      "INSERT INTO messages (id, conversation_id, project_path, project_name, " +
        "timestamp, type, content, message_uuid, parent_uuid, source, subtype, " +
        "git_branch, attribution_skill) " +
        "VALUES (?, ?, '/p', 'p', ?, ?, ?, ?, NULL, 'claude', ?, ?, ?)"
    ).run(r.id, r.conv, r.ts, r.type, r.content, r.id,
          r.subtype ?? null, r.gitBranch ?? null, r.skill ?? null);
  }
}

test("recentConversations: populates recapText from away_summary when fresh", () => {
  const db = new DatabaseSync(":memory:");
  ensureSchema(db);
  seed(db, [
    { id: "1", conv: "c", ts: 100, type: "user", content: "Q" },
    { id: "2", conv: "c", ts: 200, type: "assistant", content: "A" },
    { id: "3", conv: "c", ts: 300, type: "system",
      subtype: "away_summary", content: "RECAP" },
  ]);
  const out = recentConversations(db, { limit: 5, projectFilter: null });
  assert.equal(out.length, 1);
  assert.equal(out[0].recapText, "RECAP");
});

test("recentConversations: populates gitBranch from the most recent indexed row", () => {
  const db = new DatabaseSync(":memory:");
  ensureSchema(db);
  seed(db, [
    { id: "1", conv: "c", ts: 100, type: "user", content: "Q", gitBranch: "main" },
    { id: "2", conv: "c", ts: 200, type: "assistant", content: "A", gitBranch: "feat/foo" },
  ]);
  const out = recentConversations(db, { limit: 5, projectFilter: null });
  assert.equal(out[0].gitBranch, "feat/foo");
});

test("recentConversations: populates skill from the most recent attribution", () => {
  const db = new DatabaseSync(":memory:");
  ensureSchema(db);
  seed(db, [
    { id: "1", conv: "c", ts: 100, type: "assistant", content: "A",
      skill: "superpowers:tdd" },
  ]);
  const out = recentConversations(db, { limit: 5, projectFilter: null });
  assert.equal(out[0].skill, "superpowers:tdd");
});

test("recentConversations: gitBranch and skill are null when no rows carry them", () => {
  const db = new DatabaseSync(":memory:");
  ensureSchema(db);
  seed(db, [
    { id: "1", conv: "c", ts: 100, type: "user", content: "Q" },
    { id: "2", conv: "c", ts: 200, type: "assistant", content: "A" },
  ]);
  const out = recentConversations(db, { limit: 5, projectFilter: null });
  assert.equal(out[0].gitBranch, null);
  assert.equal(out[0].skill, null);
});
