import { test } from "node:test";
import assert from "node:assert/strict";
import { reducer, initialState } from "../../src/tui/state/store.js";
import type { Selectable, ResultRow, SectionHeader } from "../../src/core/types.js";

function chat(id: string): ResultRow {
  return {
    kind: "chat", source: "claude", sessionId: id, projectPath: "/p",
    projectName: "p", lastActivity: 0, msgCount: 0, snippet: "", score: 0,
  };
}
function section(label: string): SectionHeader {
  return { kind: "section", label };
}

test("set-results clamps cursor to first non-section row", () => {
  const results: Selectable[] = [section("dirs"), chat("a"), chat("b")];
  const next = reducer(initialState, { type: "set-results", results });
  assert.equal(next.cursor, 1);
});

test("move-cursor delta +1 skips over a section header", () => {
  const results: Selectable[] = [chat("a"), section("chats"), chat("b")];
  let s = reducer(initialState, { type: "set-results", results });
  // cursor lands on 0 (chat a)
  assert.equal(s.cursor, 0);
  s = reducer(s, { type: "move-cursor", delta: 1 });
  // delta +1 from 0 should land on 2 (chat b), skipping the section at 1
  assert.equal(s.cursor, 2);
});

test("move-cursor delta -1 skips back over a section header", () => {
  const results: Selectable[] = [chat("a"), section("chats"), chat("b")];
  let s = reducer(initialState, { type: "set-results", results });
  s = reducer(s, { type: "move-cursor", delta: 1 });
  s = reducer(s, { type: "move-cursor", delta: -1 });
  assert.equal(s.cursor, 0);
});

test("move-cursor at top boundary stays put", () => {
  const results: Selectable[] = [chat("a"), chat("b")];
  let s = reducer(initialState, { type: "set-results", results });
  s = reducer(s, { type: "move-cursor", delta: -1 });
  assert.equal(s.cursor, 0);
});

test("move-cursor at bottom boundary stays put", () => {
  const results: Selectable[] = [chat("a"), chat("b")];
  let s = reducer(initialState, { type: "set-results", results });
  s = reducer(s, { type: "move-cursor", delta: 1 });
  s = reducer(s, { type: "move-cursor", delta: 1 });
  assert.equal(s.cursor, 1);
});

test("set-results with all section headers clamps cursor to 0 (no selectable)", () => {
  const results: Selectable[] = [section("a"), section("b")];
  const next = reducer(initialState, { type: "set-results", results });
  assert.equal(next.cursor, 0);
});
