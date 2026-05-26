import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { parseArgs, selectMode } from "../../src/cli/args.js";

test("parseArgs: positional becomes query", () => {
  const a = parseArgs(["hello"]);
  assert.equal(a.query, "hello");
});

test("parseArgs: --since parses date", () => {
  const a = parseArgs(["x", "--since", "2026-01-01"]);
  assert.equal(a.since, "2026-01-01");
});

test("parseArgs: equals form --flag=value", () => {
  const a = parseArgs(["x", "--limit=5"]);
  assert.equal(a.limit, 5);
});

test("parseArgs: -- escape preserves init as literal query", () => {
  const a = parseArgs(["--", "init"]);
  assert.equal(a.query, "init");
  assert.equal(a.literalQuery, true);
});

test("selectMode: --list forces one-shot", () => {
  const a = parseArgs(["x", "--list"]);
  const m = selectMode(a, { stdinTTY: true, stdoutTTY: true });
  assert.equal(m, "one-shot");
});

test("selectMode: TTY + no flags → picker", () => {
  const a = parseArgs([]);
  const m = selectMode(a, { stdinTTY: true, stdoutTTY: true });
  assert.equal(m, "picker");
});

test("selectMode: piped stdout → one-shot", () => {
  const a = parseArgs(["query"]);
  const m = selectMode(a, { stdinTTY: true, stdoutTTY: false });
  assert.equal(m, "one-shot");
});

test("parseArgs: --format=markdown accepted", () => {
  const args = parseArgs(["--format=markdown", "foo"]);
  assert.equal(args.format, "markdown");
});

test("parseArgs: --format markdown (space) accepted", () => {
  const args = parseArgs(["--format", "markdown", "foo"]);
  assert.equal(args.format, "markdown");
});

test("parseArgs: --format=banana rejected", () => {
  let stderrMsg = "";
  const write = mock.method(process.stderr, "write", (chunk: string) => {
    stderrMsg += chunk;
  });
  const exit = mock.method(process, "exit", () => {
    throw new Error(stderrMsg);
  });
  try {
    assert.throws(
      () => parseArgs(["--format=banana", "foo"]),
      /format.*must be/
    );
  } finally {
    exit.mock.restore();
    write.mock.restore();
  }
});
