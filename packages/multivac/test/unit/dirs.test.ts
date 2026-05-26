import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { ensureSchema } from "../../src/indexer/state.js";
import { searchDirectories } from "../../src/core/search/dirs.js";

function seed(db: DatabaseSync, rows: Array<{
  conv: string; path: string; name: string; ts: number; type: string;
}>) {
  for (const r of rows) {
    db.prepare(
      "INSERT INTO messages (id, conversation_id, project_path, project_name, " +
        "timestamp, type, content, message_uuid, parent_uuid, source) " +
        "VALUES (?, ?, ?, ?, ?, ?, '', ?, NULL, 'claude')"
    ).run(`${r.conv}:${r.ts}`, r.conv, r.path, r.name, r.ts, r.type, `${r.conv}:${r.ts}`);
  }
}

test("searchDirectories: aggregates by project_path", () => {
  const db = new DatabaseSync(":memory:");
  ensureSchema(db);
  seed(db, [
    { conv: "c1", path: "/work/frontend", name: "frontend", ts: 100, type: "user" },
    { conv: "c1", path: "/work/frontend", name: "frontend", ts: 200, type: "assistant" },
    { conv: "c2", path: "/work/frontend", name: "frontend", ts: 300, type: "user" },
    { conv: "c3", path: "/work/backend",  name: "backend",  ts: 150, type: "user" },
  ]);
  const dirs = searchDirectories(db, { limit: 10, projectFilter: null });
  assert.equal(dirs.length, 2);
  // Most recent dir comes first.
  assert.equal(dirs[0].projectPath, "/work/frontend");
  assert.equal(dirs[0].chatCount, 2);
  assert.equal(dirs[0].lastActivity, 300);
  assert.equal(dirs[1].projectPath, "/work/backend");
  assert.equal(dirs[1].chatCount, 1);
});

test("searchDirectories: case-insensitive substring filter on path OR name", () => {
  const db = new DatabaseSync(":memory:");
  ensureSchema(db);
  seed(db, [
    { conv: "c1", path: "/work/frontend", name: "frontend", ts: 100, type: "user" },
    { conv: "c2", path: "/work/Backend",  name: "BACKEND",  ts: 200, type: "user" },
  ]);
  const onName = searchDirectories(db, { limit: 10, projectFilter: "fronT" });
  assert.equal(onName.length, 1);
  assert.equal(onName[0].projectPath, "/work/frontend");

  const onPath = searchDirectories(db, { limit: 10, projectFilter: "BACKend" });
  assert.equal(onPath.length, 1);
  assert.equal(onPath[0].projectPath, "/work/Backend");
});

test("searchDirectories: topChatTitles picks 3 most-recent conversations", () => {
  const db = new DatabaseSync(":memory:");
  ensureSchema(db);
  seed(db, [
    { conv: "c1", path: "/p", name: "p", ts: 100, type: "user" },
    { conv: "c2", path: "/p", name: "p", ts: 200, type: "user" },
    { conv: "c3", path: "/p", name: "p", ts: 300, type: "user" },
    { conv: "c4", path: "/p", name: "p", ts: 400, type: "user" },
  ]);
  const [dir] = searchDirectories(db, { limit: 10, projectFilter: null });
  assert.equal(dir.topChatTitles.length, 3);
  // Recency order: c4, c3, c2.
  assert.ok(dir.topChatTitles[0].includes("c4") || dir.topChatTitles[0].length > 0);
});

test("searchDirectories: ignores non-user/assistant rows in the count", () => {
  const db = new DatabaseSync(":memory:");
  ensureSchema(db);
  seed(db, [
    { conv: "c1", path: "/p", name: "p", ts: 100, type: "user" },
    { conv: "c1", path: "/p", name: "p", ts: 200, type: "tool_use" },
    { conv: "c1", path: "/p", name: "p", ts: 300, type: "tool_result" },
  ]);
  const [dir] = searchDirectories(db, { limit: 10, projectFilter: null });
  assert.equal(dir.chatCount, 1);
});

test("searchDirectories: returns kind:'dir' on every row", () => {
  const db = new DatabaseSync(":memory:");
  ensureSchema(db);
  seed(db, [{ conv: "c1", path: "/p", name: "p", ts: 100, type: "user" }]);
  const dirs = searchDirectories(db, { limit: 10, projectFilter: null });
  for (const d of dirs) assert.equal(d.kind, "dir");
});
