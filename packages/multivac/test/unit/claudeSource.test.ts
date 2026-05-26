import { test } from "node:test";
import assert from "node:assert/strict";
import { buildClaudeArgs } from "../../src/sources/claude/resume.js";
import type { ResultRow } from "../../src/core/types.js";

const row: ResultRow = {
  kind: "chat",
  source: "claude", sessionId: "abc-123", projectPath: "/p",
  projectName: "p", lastActivity: 0, msgCount: 0, snippet: "", score: 0,
};

test("resume action — no name", () => {
  assert.deepEqual(buildClaudeArgs("resume", row, null), ["--resume", "abc-123"]);
});

test("resume action — with name", () => {
  assert.deepEqual(buildClaudeArgs("resume", row, "Foo"), ["--name", "Foo", "--resume", "abc-123"]);
});

test("fork action prepends --fork-session", () => {
  assert.deepEqual(buildClaudeArgs("fork", row, null), ["--fork-session", "--resume", "abc-123"]);
});

test("dangerous action prepends --dangerously-skip-permissions", () => {
  assert.deepEqual(buildClaudeArgs("dangerous", row, null), ["--dangerously-skip-permissions", "--resume", "abc-123"]);
});

test("remote-control: name flows into positional arg (no --name)", () => {
  assert.deepEqual(buildClaudeArgs("remote-control", row, "Foo"), ["--remote-control", "Foo", "--resume", "abc-123"]);
});

test("remote-control: no name → no positional", () => {
  assert.deepEqual(buildClaudeArgs("remote-control", row, null), ["--remote-control", "--resume", "abc-123"]);
});

test("newchat action: no session, no name → empty argv", () => {
  assert.deepEqual(buildClaudeArgs("newchat", row, null), []);
});

test("newchat action: with savedName → ['--name', name]", () => {
  assert.deepEqual(buildClaudeArgs("newchat", row, "Foo"), ["--name", "Foo"]);
});

test("newchat action: ignores sessionId (no --resume in output)", () => {
  const args = buildClaudeArgs("newchat", row, null);
  assert.ok(!args.includes("--resume"), "newchat must NOT include --resume");
  assert.ok(!args.includes(row.sessionId), "newchat must NOT include the session id");
});
