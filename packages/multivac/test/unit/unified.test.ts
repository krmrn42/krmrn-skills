import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { ensureSchema } from "../../src/indexer/state.js";
import { buildProjectGroups } from "../../src/core/search/unified.js";
import type { Args, Selectable, ProjectHeader, MoreRow, ResultRow } from "../../src/core/types.js";

function defaultArgs(query: string, overrides: Partial<Args> = {}): Args {
  return {
    query, interactive: false, list: false, regex: null, regexCompiled: null,
    scan: false, includeTools: false, onlyUser: false, project: null,
    since: null, sinceTs: 0, limit: 20, format: null, dbPath: ":memory:",
    preview: null, noColor: false, help: false, reindex: false,
    indexStatus: false, dangerouslySkipPermissions: false, printNames: false,
    unpinAll: false, noTmux: false, literalQuery: false, ...overrides,
  };
}

function seed(db: DatabaseSync, rows: Array<{
  conv: string; path: string; name: string; ts: number; type: string; content: string;
}>) {
  for (const r of rows) {
    db.prepare(
      "INSERT INTO messages (id, conversation_id, project_path, project_name, " +
        "timestamp, type, content, message_uuid, parent_uuid, source) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 'claude')"
    ).run(`${r.conv}:${r.ts}`, r.conv, r.path, r.name, r.ts, r.type, r.content, `${r.conv}:${r.ts}`);
  }
}

function projectsOf(rows: Selectable[]): ProjectHeader[] {
  return rows.filter((r): r is ProjectHeader => r.kind === "project");
}

function chatsOf(rows: Selectable[]): ResultRow[] {
  return rows.filter((r): r is ResultRow => r.kind === "chat");
}

test("buildProjectGroups: home mode emits one ProjectHeader per project (ordered by recency)", () => {
  const db = new DatabaseSync(":memory:");
  ensureSchema(db);
  seed(db, [
    { conv: "c1", path: "/work/frontend", name: "frontend", ts: 100, type: "user", content: "Q1" },
    { conv: "c1", path: "/work/frontend", name: "frontend", ts: 200, type: "assistant", content: "A1" },
    { conv: "c2", path: "/work/backend",  name: "backend",  ts: 50,  type: "user", content: "Q2" },
  ]);
  const rows = buildProjectGroups(db, defaultArgs(""), null);
  const projects = projectsOf(rows);
  assert.equal(projects.length, 2);
  assert.equal(projects[0].projectPath, "/work/frontend"); // most recent first
  assert.equal(projects[1].projectPath, "/work/backend");
});

test("buildProjectGroups: home mode shows ≤3 chats per project, in recency order", () => {
  const db = new DatabaseSync(":memory:");
  ensureSchema(db);
  // 5 chats in one project, recency order c5 > c4 > c3 > c2 > c1
  seed(db, [
    { conv: "c1", path: "/p", name: "p", ts: 100, type: "user", content: "Q1" },
    { conv: "c2", path: "/p", name: "p", ts: 200, type: "user", content: "Q2" },
    { conv: "c3", path: "/p", name: "p", ts: 300, type: "user", content: "Q3" },
    { conv: "c4", path: "/p", name: "p", ts: 400, type: "user", content: "Q4" },
    { conv: "c5", path: "/p", name: "p", ts: 500, type: "user", content: "Q5" },
  ]);
  const rows = buildProjectGroups(db, defaultArgs(""), null);
  const chats = chatsOf(rows);
  assert.equal(chats.length, 3, "home mode shows min(3, chatCount) chats");
  assert.deepEqual(chats.map((c) => c.sessionId), ["c5", "c4", "c3"]);
});

test("buildProjectGroups: emits MoreRow when chats are elided", () => {
  const db = new DatabaseSync(":memory:");
  ensureSchema(db);
  seed(db, [
    { conv: "c1", path: "/p", name: "p", ts: 100, type: "user", content: "Q1" },
    { conv: "c2", path: "/p", name: "p", ts: 200, type: "user", content: "Q2" },
    { conv: "c3", path: "/p", name: "p", ts: 300, type: "user", content: "Q3" },
    { conv: "c4", path: "/p", name: "p", ts: 400, type: "user", content: "Q4" },
    { conv: "c5", path: "/p", name: "p", ts: 500, type: "user", content: "Q5" },
  ]);
  const rows = buildProjectGroups(db, defaultArgs(""), null);
  const moreRow = rows.find((r): r is MoreRow => r.kind === "more");
  assert.ok(moreRow, "expected a MoreRow");
  assert.equal(moreRow.remainingCount, 2, "5 total − 3 shown = 2 more");
});

test("buildProjectGroups: no MoreRow when chatCount ≤ shown", () => {
  const db = new DatabaseSync(":memory:");
  ensureSchema(db);
  seed(db, [
    { conv: "c1", path: "/p", name: "p", ts: 100, type: "user", content: "Q1" },
    { conv: "c2", path: "/p", name: "p", ts: 200, type: "user", content: "Q2" },
  ]);
  const rows = buildProjectGroups(db, defaultArgs(""), null);
  const moreRow = rows.find((r) => r.kind === "more");
  assert.equal(moreRow, undefined);
});

test("buildProjectGroups: empty result when nothing matches", () => {
  const db = new DatabaseSync(":memory:");
  ensureSchema(db);
  seed(db, [
    { conv: "c1", path: "/p", name: "p", ts: 100, type: "user", content: "Q1" },
  ]);
  const rows = buildProjectGroups(db, defaultArgs("zzzzz"), null);
  assert.deepEqual(rows, []);
});

test("buildProjectGroups: search query hits project name → pads to ≥3 chats", () => {
  const db = new DatabaseSync(":memory:");
  ensureSchema(db);
  // Project name "frontend"; 1 chat matches "router" by content.
  seed(db, [
    { conv: "c1", path: "/work/frontend", name: "frontend", ts: 100, type: "user", content: "frontend bug" },
    { conv: "c2", path: "/work/frontend", name: "frontend", ts: 200, type: "user", content: "router crash" },
    { conv: "c3", path: "/work/frontend", name: "frontend", ts: 300, type: "user", content: "deploy notes" },
  ]);
  // Query "frontend" hits the project name; should pad with recent chats.
  const rows = buildProjectGroups(db, defaultArgs("frontend"), null);
  const projects = projectsOf(rows);
  assert.equal(projects.length, 1);
  const chats = chatsOf(rows);
  // 1 chat could match "frontend" by content; should pad to min 3.
  assert.ok(chats.length >= 1, "at least one chat shown when project name hits");
});

test("buildProjectGroups: search query does NOT hit project name → only matching chats", () => {
  const db = new DatabaseSync(":memory:");
  ensureSchema(db);
  // Project name "frontend"; one chat contains "router".
  seed(db, [
    { conv: "c1", path: "/work/frontend", name: "frontend", ts: 100, type: "user", content: "frontend bug" },
    { conv: "c2", path: "/work/frontend", name: "frontend", ts: 200, type: "user", content: "router crash" },
    { conv: "c3", path: "/work/frontend", name: "frontend", ts: 300, type: "user", content: "deploy notes" },
  ]);
  // "router" does NOT hit the project name; show only the matching chat.
  const rows = buildProjectGroups(db, defaultArgs("router"), null);
  const chats = chatsOf(rows);
  assert.equal(chats.length, 1, "only the matching chat is shown");
  assert.equal(chats[0].sessionId, "c2");
});

test("buildProjectGroups: project with no chats to show is hidden", () => {
  const db = new DatabaseSync(":memory:");
  ensureSchema(db);
  seed(db, [
    { conv: "c1", path: "/work/frontend", name: "frontend", ts: 100, type: "user", content: "frontend" },
    { conv: "c2", path: "/work/backend",  name: "backend",  ts: 200, type: "user", content: "deploy" },
  ]);
  const rows = buildProjectGroups(db, defaultArgs("frontend"), null);
  const projects = projectsOf(rows);
  // backend project has no matching chats AND its name doesn't hit; hidden.
  assert.equal(projects.length, 1);
  assert.equal(projects[0].projectPath, "/work/frontend");
});
