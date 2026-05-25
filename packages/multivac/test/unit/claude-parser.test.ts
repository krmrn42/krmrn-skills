import { test } from "node:test";
import assert from "node:assert/strict";
import { recordToRows, INDEXABLE_TYPES, parse } from "../../src/sources/claude/parse.js";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

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
