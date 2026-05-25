import { test } from "node:test";
import assert from "node:assert/strict";
import { recordToRows, INDEXABLE_TYPES } from "../../src/sources/claude/parse.js";

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
