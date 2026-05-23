import React from "react";
import { test } from "node:test";
import assert from "node:assert/strict";
import { render } from "ink-testing-library";
import { ResultList } from "../../src/tui/components/ResultList.js";
import type { ResultRow } from "../../src/core/types.js";

function row(id: string, opts: Partial<ResultRow> = {}): ResultRow {
  return {
    source: "claude", sessionId: id, projectPath: "/p", projectName: "p",
    lastActivity: 1700000000, msgCount: 1, snippet: "hello world", score: 0,
    ...opts,
  };
}

test("ResultList shows divider between pinned and unpinned rows", () => {
  const rows = [row("a", { isPinned: true }), row("b", { isPinned: false })];
  const { lastFrame } = render(
    <ResultList results={rows} cursor={0} noColor={true} listWidth={80} maxRows={20} dimRows={false} />
  );
  const frame = lastFrame() ?? "";
  assert.ok(frame.includes("── recent ──"));
});

test("ResultList: noColor uses '* ' pin marker", () => {
  const rows = [row("a", { isPinned: true })];
  const { lastFrame } = render(
    <ResultList results={rows} cursor={0} noColor={true} listWidth={80} maxRows={20} dimRows={false} />
  );
  const frame = lastFrame() ?? "";
  assert.ok(frame.includes("* "));
});

test("ResultList: noColor=false uses pin emoji", () => {
  const rows = [row("a", { isPinned: true })];
  const { lastFrame } = render(
    <ResultList results={rows} cursor={0} noColor={false} listWidth={80} maxRows={20} dimRows={false} />
  );
  const frame = lastFrame() ?? "";
  assert.ok(frame.includes("📌"));
});

test("ResultList: selected row has cursor prefix", () => {
  const rows = [row("a"), row("b")];
  const { lastFrame } = render(
    <ResultList results={rows} cursor={1} noColor={true} listWidth={80} maxRows={20} dimRows={false} />
  );
  const frame = lastFrame() ?? "";
  // The cursor prefix character `▌` must appear in the frame at least once.
  assert.ok(frame.includes("▌"));
});
