import { test } from "node:test";
import assert from "node:assert/strict";
import { reducer, initialState } from "../../src/tui/state/store.js";
import type { Selectable, ResultRow, ProjectHeader, MoreRow } from "../../src/core/types.js";

function chat(id: string): ResultRow {
  return {
    kind: "chat", source: "claude", sessionId: id, projectPath: "/p",
    projectName: "p", lastActivity: 0, msgCount: 0, snippet: "", score: 0,
  };
}
function project(path: string): ProjectHeader {
  return {
    kind: "project", projectPath: path, projectName: path.split("/").pop() ?? "?",
    chatCount: 1, lastActivity: 0, topChatTitles: [],
  };
}
function more(path: string, n: number): MoreRow {
  return { kind: "more", projectPath: path, remainingCount: n };
}

test("set-results: cursor lands on first selectable row (project header is selectable)", () => {
  const results: Selectable[] = [project("/p1"), chat("a"), chat("b")];
  const next = reducer(initialState, { type: "set-results", results });
  // Project header is selectable; cursor at 0.
  assert.equal(next.cursor, 0);
});

test("set-results: cursor skips a leading MoreRow", () => {
  // A more row at index 0 (degenerate; producer never emits this, but reducer
  // should still cope) — cursor jumps to the first selectable row.
  const results: Selectable[] = [more("/p1", 3), chat("a"), chat("b")];
  const next = reducer(initialState, { type: "set-results", results });
  assert.equal(next.cursor, 1);
});

test("move-cursor +1 skips over a MoreRow", () => {
  const results: Selectable[] = [chat("a"), more("/p", 5), chat("b")];
  let s = reducer(initialState, { type: "set-results", results });
  assert.equal(s.cursor, 0);
  s = reducer(s, { type: "move-cursor", delta: 1 });
  // delta +1 from 0 lands on 2 (chat b), skipping the more row at 1.
  assert.equal(s.cursor, 2);
});

test("move-cursor -1 skips back over a MoreRow", () => {
  const results: Selectable[] = [chat("a"), more("/p", 5), chat("b")];
  let s = reducer(initialState, { type: "set-results", results });
  s = reducer(s, { type: "move-cursor", delta: 1 });
  s = reducer(s, { type: "move-cursor", delta: -1 });
  assert.equal(s.cursor, 0);
});

test("move-cursor can land on a ProjectHeader (it's selectable)", () => {
  const results: Selectable[] = [chat("a"), project("/p2"), chat("b")];
  let s = reducer(initialState, { type: "set-results", results });
  s = reducer(s, { type: "move-cursor", delta: 1 });
  // Lands on the project header (selectable).
  assert.equal(s.cursor, 1);
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

test("set-results with only MoreRows clamps cursor to 0 (no selectable)", () => {
  const results: Selectable[] = [more("/p1", 1), more("/p2", 1)];
  const next = reducer(initialState, { type: "set-results", results });
  assert.equal(next.cursor, 0);
});
