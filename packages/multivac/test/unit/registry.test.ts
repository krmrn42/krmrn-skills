import { test } from "node:test";
import assert from "node:assert/strict";
import { getRegistry, getSource } from "../../src/sources/registry.js";

test("registry exposes claude by default", () => {
  const reg = getRegistry();
  assert.equal(reg.length, 1);
  assert.equal(reg[0].id, "claude");
  assert.equal(reg[0].displayName, "Claude Code");
});

test("getSource('claude') returns the claude source", () => {
  const s = getSource("claude");
  assert.ok(s);
  assert.equal(s.id, "claude");
});

test("getSource('nope') returns undefined", () => {
  assert.equal(getSource("nope"), undefined);
});
