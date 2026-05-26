import { test } from "node:test";
import assert from "node:assert/strict";
import { applyPinOrdering } from "../../src/core/search/pin-ordering.js";
import type { ResultRow, SessionStore } from "../../src/core/types.js";

function row(source: string, id: string): ResultRow {
  return {
    kind: "chat",
    source, sessionId: id, projectPath: "", projectName: "",
    lastActivity: 0, msgCount: 0, snippet: "", score: 0,
  };
}

test("no pins → all rows returned, none marked pinned", () => {
  const rows = [row("claude", "a"), row("claude", "b")];
  const out = applyPinOrdering(rows, { version: 1, names: {}, pins: [] }, 10);
  assert.equal(out.length, 2);
  assert.equal(out[0].isPinned, false);
});

test("pinned row floats to top in pin order", () => {
  const rows = [row("claude", "a"), row("claude", "b"), row("claude", "c")];
  const store: SessionStore = { version: 1, names: {}, pins: ["claude:c", "claude:a"] };
  const out = applyPinOrdering(rows, store, 10);
  assert.deepEqual(out.map((r) => r.sessionId), ["c", "a", "b"]);
  assert.equal(out[0].isPinned, true);
  assert.equal(out[1].isPinned, true);
  assert.equal(out[2].isPinned, false);
});

test("limit caps total including pinned", () => {
  const rows = [row("claude", "a"), row("claude", "b"), row("claude", "c")];
  const store: SessionStore = { version: 1, names: {}, pins: ["claude:c"] };
  const out = applyPinOrdering(rows, store, 2);
  assert.equal(out.length, 2);
  assert.equal(out[0].sessionId, "c");
});

test("source-keyed pin does not match a different source", () => {
  const rows = [row("codex", "a"), row("claude", "a")];
  const store: SessionStore = { version: 1, names: {}, pins: ["claude:a"] };
  const out = applyPinOrdering(rows, store, 10);
  assert.equal(out[0].sessionId, "a");
  assert.equal(out[0].source, "claude");
  assert.equal(out[0].isPinned, true);
  assert.equal(out[1].isPinned, false);
});
