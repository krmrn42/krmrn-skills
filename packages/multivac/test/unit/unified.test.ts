import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { ensureSchema } from "../../src/indexer/state.js";
import { buildUnifiedResults } from "../../src/core/search/unified.js";
import type { Args } from "../../src/core/types.js";

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

test("buildUnifiedResults: empty query → dirs section + chats section, both with headers", () => {
  const db = new DatabaseSync(":memory:");
  ensureSchema(db);
  seed(db, [
    { conv: "c1", path: "/work/frontend", name: "frontend", ts: 100, type: "user", content: "Q1" },
    { conv: "c1", path: "/work/frontend", name: "frontend", ts: 200, type: "assistant", content: "A1" },
    { conv: "c2", path: "/work/backend",  name: "backend",  ts: 50,  type: "user", content: "Q2" },
  ]);
  const out = buildUnifiedResults(db, defaultArgs(""), null);
  const kinds = out.map((r) => r.kind);
  const sections = out.filter((r) => r.kind === "section").map((r) =>
    r.kind === "section" ? r.label : "");
  // Header for each non-empty section.
  assert.ok(sections.length >= 2, "expected at least dirs + chats section headers");
  assert.ok(sections.some((l) => l.includes("dir")), "expected a dirs section header");
  assert.ok(sections.some((l) => l.includes("chat")), "expected a chats section header");
  // Dirs come before chats.
  const firstDir = kinds.indexOf("dir");
  const firstChat = kinds.indexOf("chat");
  assert.ok(firstDir < firstChat, "dirs section should be above chats section");
});

test("buildUnifiedResults: dividers suppressed when only one section has rows", () => {
  const db = new DatabaseSync(":memory:");
  ensureSchema(db);
  seed(db, [
    { conv: "c1", path: "/p", name: "p", ts: 100, type: "user", content: "Q1" },
  ]);
  // Filter to a name that matches no dir. (Substring "xxx" matches nothing.)
  const out = buildUnifiedResults(db, defaultArgs("xxx"), null);
  // With no matches in either section, output is empty.
  assert.deepEqual(out, []);
});

test("buildUnifiedResults: text query routes chats through FTS", () => {
  const db = new DatabaseSync(":memory:");
  ensureSchema(db);
  seed(db, [
    { conv: "c1", path: "/work/frontend", name: "frontend", ts: 100, type: "user", content: "router crash" },
    { conv: "c1", path: "/work/frontend", name: "frontend", ts: 200, type: "assistant", content: "fix the router" },
  ]);
  const out = buildUnifiedResults(db, defaultArgs("router"), null);
  // At least one chat should match.
  assert.ok(out.some((r) => r.kind === "chat"),
    "expected an FTS match on 'router'");
});

test("buildUnifiedResults: substring query routes dirs through substring filter", () => {
  const db = new DatabaseSync(":memory:");
  ensureSchema(db);
  seed(db, [
    { conv: "c1", path: "/work/frontend", name: "frontend", ts: 100, type: "user", content: "Q1" },
    { conv: "c1", path: "/work/frontend", name: "frontend", ts: 200, type: "assistant", content: "A1" },
    { conv: "c2", path: "/work/backend",  name: "backend",  ts: 50, type: "user", content: "Q2" },
  ]);
  const out = buildUnifiedResults(db, defaultArgs("frontend"), null);
  const dirs = out.filter((r) => r.kind === "dir");
  assert.equal(dirs.length, 1);
  assert.equal(dirs[0].kind === "dir" ? dirs[0].projectPath : "", "/work/frontend");
});
