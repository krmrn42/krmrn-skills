import { test } from "node:test";
import assert from "node:assert/strict";
import { recordToRows, INDEXABLE_TYPES, parse } from "../../src/sources/claude/parse.js";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { ensureSchema } from "../../src/indexer/state.js";

async function collect<T>(it: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of it) out.push(item);
  return out;
}

function writeJsonl(lines: object[]): string {
  const tmp = path.join(os.tmpdir(), `multivac-parse-${Date.now()}-${Math.random()}.jsonl`);
  fs.writeFileSync(tmp, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  return tmp;
}

test("INDEXABLE_TYPES includes 'system' (for away_summary)", () => {
  assert.ok(INDEXABLE_TYPES.has("system"));
});

test("recordToRows: system/away_summary yields one row", () => {
  const rec = {
    type: "system",
    subtype: "away_summary",
    sessionId: "s1",
    uuid: "u1",
    parentUuid: "p1",
    content: "You asked X; I did Y; next: Z",
  };
  const rows = recordToRows(rec);
  assert.equal(rows?.length, 1);
  assert.equal(rows![0].type, "system");
  assert.equal(rows![0].content, "You asked X; I did Y; next: Z");
  assert.equal(rows![0].message_uuid, "u1");
});

test("recordToRows: system/hook_success returns empty (not indexed)", () => {
  const rec = {
    type: "system",
    subtype: "hook_success",
    sessionId: "s1",
    uuid: "u2",
    content: "noise",
  };
  const rows = recordToRows(rec);
  assert.deepEqual(rows, []);
});

test("recordToRows: system without subtype returns empty", () => {
  const rec = {
    type: "system",
    sessionId: "s1",
    uuid: "u3",
    content: "no subtype",
  };
  const rows = recordToRows(rec);
  assert.deepEqual(rows, []);
});

test("recordToRows: system/away_summary missing sessionId returns null (malformed)", () => {
  const rec = {
    type: "system",
    subtype: "away_summary",
    uuid: "u4",
    content: "summary",
  };
  const rows = recordToRows(rec);
  assert.equal(rows, null);
});

test("parse: extracts gitBranch from JSONL top-level", async () => {
  const p = writeJsonl([
    { type: "user", sessionId: "s", uuid: "u1", gitBranch: "main",
      message: { content: "hello" }, timestamp: "2026-01-01T00:00:00Z" },
  ]);
  try {
    const rows = await collect(parse({ path: p, mtimeMs: 0 }));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].gitBranch, "main");
  } finally { fs.unlinkSync(p); }
});

test("parse: extracts attributionSkill", async () => {
  const p = writeJsonl([
    { type: "assistant", sessionId: "s", uuid: "u1",
      attributionSkill: "superpowers:tdd",
      message: { content: [{ type: "text", text: "ack" }] },
      timestamp: "2026-01-01T00:00:00Z" },
  ]);
  try {
    const rows = await collect(parse({ path: p, mtimeMs: 0 }));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].attributionSkill, "superpowers:tdd");
  } finally { fs.unlinkSync(p); }
});

test("parse: extracts subtype for system rows", async () => {
  const p = writeJsonl([
    { type: "system", subtype: "away_summary", sessionId: "s", uuid: "u1",
      content: "recap text", timestamp: "2026-01-01T00:00:00Z" },
  ]);
  try {
    const rows = await collect(parse({ path: p, mtimeMs: 0 }));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].subtype, "away_summary");
  } finally { fs.unlinkSync(p); }
});

test("parse: subtype is undefined for non-system rows even if present in JSONL", async () => {
  const p = writeJsonl([
    { type: "user", subtype: "should_be_ignored", sessionId: "s", uuid: "u1",
      message: { content: "hi" }, timestamp: "2026-01-01T00:00:00Z" },
  ]);
  try {
    const rows = await collect(parse({ path: p, mtimeMs: 0 }));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].subtype, undefined);
  } finally { fs.unlinkSync(p); }
});

test("parse: missing gitBranch yields undefined", async () => {
  const p = writeJsonl([
    { type: "user", sessionId: "s", uuid: "u1",
      message: { content: "hello" }, timestamp: "2026-01-01T00:00:00Z" },
  ]);
  try {
    const rows = await collect(parse({ path: p, mtimeMs: 0 }));
    assert.equal(rows[0].gitBranch, undefined);
  } finally { fs.unlinkSync(p); }
});

test("indexer schema accepts new columns (subtype, git_branch, attribution_skill)", () => {
  const db = new DatabaseSync(":memory:");
  ensureSchema(db);
  const stmt = db.prepare(
    "INSERT INTO messages (id, conversation_id, project_path, project_name, " +
      "timestamp, type, content, message_uuid, parent_uuid, source, " +
      "subtype, git_branch, attribution_skill) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );
  stmt.run("id1", "conv1", "/p", "p", 1700000000, "system", "recap",
           "u1", null, "claude", "away_summary", "main", "superpowers:tdd");
  const row = db.prepare(
    "SELECT subtype, git_branch, attribution_skill FROM messages WHERE id = 'id1'"
  ).get() as { subtype: string; git_branch: string; attribution_skill: string };
  assert.equal(row.subtype, "away_summary");
  assert.equal(row.git_branch, "main");
  assert.equal(row.attribution_skill, "superpowers:tdd");
});

test("indexer schema: new columns accept and return NULL", () => {
  const db = new DatabaseSync(":memory:");
  ensureSchema(db);
  const stmt = db.prepare(
    "INSERT INTO messages (id, conversation_id, project_path, project_name, " +
      "timestamp, type, content, message_uuid, parent_uuid, source, " +
      "subtype, git_branch, attribution_skill) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );
  stmt.run("id2", "conv2", "/p", "p", 1700000001, "user", "hello",
           "u2", null, "claude", null, null, null);
  const row = db.prepare(
    "SELECT subtype, git_branch, attribution_skill FROM messages WHERE id = 'id2'"
  ).get() as { subtype: string | null; git_branch: string | null; attribution_skill: string | null };
  assert.equal(row.subtype, null);
  assert.equal(row.git_branch, null);
  assert.equal(row.attribution_skill, null);
});

import { detectSubagentParentCwd } from "../../src/sources/claude/parse.js";

test("detectSubagentParentCwd: returns null for a non-subagent JSONL", () => {
  // /tmp/foo/abc.jsonl — parent dir is "foo", not "subagents"
  const cwd = detectSubagentParentCwd("/tmp/foo/abc.jsonl");
  assert.equal(cwd, null);
});

test("detectSubagentParentCwd: returns parent JSONL's cwd when present", () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "multivac-subagent-"));
  try {
    const projectsDir = path.join(tmpRoot, "projects", "-home-user-frontend");
    const convId = "conv-xyz";
    const subagentsDir = path.join(projectsDir, convId, "subagents");
    fs.mkdirSync(subagentsDir, { recursive: true });
    // Parent JSONL with a cwd field on its first line.
    fs.writeFileSync(
      path.join(projectsDir, `${convId}.jsonl`),
      JSON.stringify({
        type: "user", sessionId: convId, uuid: "u1",
        cwd: "/home/user/frontend",
        message: { content: "hello" },
        timestamp: "2026-01-01T00:00:00Z",
      }) + "\n",
    );
    // Subagent JSONL (content irrelevant for this helper).
    const subPath = path.join(subagentsDir, "agent-abc.jsonl");
    fs.writeFileSync(subPath, "");
    const cwd = detectSubagentParentCwd(subPath);
    assert.equal(cwd, "/home/user/frontend");
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test("detectSubagentParentCwd: returns null when parent JSONL is missing", () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "multivac-subagent-"));
  try {
    const projectsDir = path.join(tmpRoot, "projects", "-home-user-frontend");
    const subagentsDir = path.join(projectsDir, "conv-xyz", "subagents");
    fs.mkdirSync(subagentsDir, { recursive: true });
    // NOTE: no parent JSONL written.
    const subPath = path.join(subagentsDir, "agent-abc.jsonl");
    fs.writeFileSync(subPath, "");
    const cwd = detectSubagentParentCwd(subPath);
    assert.equal(cwd, null);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test("parse: subagent JSONL rows are coerced to parent's project_path", async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "multivac-subagent-"));
  try {
    const projectsDir = path.join(tmpRoot, "projects", "-home-user-frontend");
    const convId = "conv-abc";
    const subagentsDir = path.join(projectsDir, convId, "subagents");
    fs.mkdirSync(subagentsDir, { recursive: true });
    fs.writeFileSync(
      path.join(projectsDir, `${convId}.jsonl`),
      JSON.stringify({
        type: "user", sessionId: convId, uuid: "uparent",
        cwd: "/home/user/frontend",
        message: { content: "outer" },
        timestamp: "2026-01-01T00:00:00Z",
      }) + "\n",
    );
    // Subagent JSONL with a DIFFERENT cwd (a subdirectory the subagent cd'd into).
    const subPath = path.join(subagentsDir, "agent-abc.jsonl");
    fs.writeFileSync(
      subPath,
      JSON.stringify({
        type: "user", sessionId: "agent-abc", uuid: "usub",
        cwd: "/home/user/frontend/packages/inner",   // <-- subdirectory cwd
        message: { content: "from inside the subagent" },
        timestamp: "2026-01-01T00:01:00Z",
      }) + "\n",
    );
    const rows = await collect(parse({ path: subPath, mtimeMs: 0 }));
    assert.equal(rows.length, 1);
    // Coerced to the parent session's project_path, NOT the subagent's cwd.
    assert.equal(rows[0].projectPath, "/home/user/frontend");
    assert.equal(rows[0].isSubagent, true);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test("parse: non-subagent JSONL is unaffected (isSubagent=false, raw cwd kept)", async () => {
  const p = writeJsonl([
    { type: "user", sessionId: "s", uuid: "u1",
      cwd: "/home/user/frontend",
      message: { content: "hi" }, timestamp: "2026-01-01T00:00:00Z" },
  ]);
  try {
    const rows = await collect(parse({ path: p, mtimeMs: 0 }));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].projectPath, "/home/user/frontend");
    assert.equal(rows[0].isSubagent, false);
  } finally { fs.unlinkSync(p); }
});

test("parse: yields entrypoint=sdk-cli for SDK-CLI sessions (isSubagent stays false — they're not subagent files)", async () => {
  // SDK-CLI sessions are top-level JSONLs (not under subagents/); the
  // attribute-level signal is entrypoint='sdk-cli', not isSubagent. The
  // search filters gate on (entrypoint IS NULL OR entrypoint = 'cli') AND
  // is_subagent = 0 — see spec §D15.
  const p = writeJsonl([
    { type: "attachment", sessionId: "s", uuid: "u0",
      cwd: "/tmp/probe-xyz", entrypoint: "sdk-cli",
      attachment: { type: "hook_success" },
      timestamp: "2026-01-01T00:00:00Z" },
    { type: "user", sessionId: "s", uuid: "u1",
      cwd: "/tmp/probe-xyz",
      message: { content: "scripted prompt" },
      timestamp: "2026-01-01T00:00:01Z" },
  ]);
  try {
    const rows = await collect(parse({ path: p, mtimeMs: 0 }));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].entrypoint, "sdk-cli");
    assert.equal(rows[0].isSubagent, false,
      "isSubagent is path-based; SDK-CLI in a top-level JSONL is not a subagent file");
  } finally { fs.unlinkSync(p); }
});

test("parse: yields entrypoint=cli for real terminal sessions", async () => {
  const p = writeJsonl([
    { type: "attachment", sessionId: "s", uuid: "u0",
      cwd: "/home/u/projects/real", entrypoint: "cli",
      attachment: { type: "hook_success" },
      timestamp: "2026-01-01T00:00:00Z" },
    { type: "user", sessionId: "s", uuid: "u1",
      cwd: "/home/u/projects/real",
      message: { content: "a real question" },
      timestamp: "2026-01-01T00:00:01Z" },
  ]);
  try {
    const rows = await collect(parse({ path: p, mtimeMs: 0 }));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].entrypoint, "cli");
    assert.equal(rows[0].isSubagent, false);
  } finally { fs.unlinkSync(p); }
});

test("parse: yields entrypoint=undefined when JSONL never carries the field (legacy)", async () => {
  const p = writeJsonl([
    { type: "user", sessionId: "s", uuid: "u1",
      cwd: "/home/u/projects/real",
      message: { content: "hi" },
      timestamp: "2026-01-01T00:00:00Z" },
  ]);
  try {
    const rows = await collect(parse({ path: p, mtimeMs: 0 }));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].entrypoint, undefined,
      "legacy rows have no entrypoint; SQL filter treats NULL as 'cli'");
  } finally { fs.unlinkSync(p); }
});
