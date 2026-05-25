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

test("ResultList: chat row shows metadata strip when gitBranch is present", () => {
  const rows = [row("a", { gitBranch: "main", skill: "superpowers:tdd" })];
  const { lastFrame } = render(
    <ResultList results={rows} cursor={0} noColor={true} listWidth={80}
                maxRows={20} dimRows={false} />
  );
  const frame = lastFrame() ?? "";
  assert.ok(frame.includes("(main)"), "expected branch in meta strip");
  assert.ok(frame.includes("superpowers:tdd"), "expected skill in meta strip");
});

test("ResultList: chat row shows recap when present and no FTS snippet", () => {
  const rows = [row("a", { recapText: "RECAP HERE", snippet: "" })];
  const { lastFrame } = render(
    <ResultList results={rows} cursor={0} noColor={true} listWidth={80}
                maxRows={20} dimRows={false} />
  );
  assert.ok((lastFrame() ?? "").includes("RECAP HERE"));
});

test("ResultList: FTS snippet beats recap when both present", () => {
  const rows = [row("a", { recapText: "RECAP", snippet: "MATCH context" })];
  const { lastFrame } = render(
    <ResultList results={rows} cursor={0} noColor={true} listWidth={80}
                maxRows={20} dimRows={false} />
  );
  const frame = lastFrame() ?? "";
  assert.ok(frame.includes("MATCH"));
  assert.ok(!frame.includes("RECAP"));
});

test("ResultList: chat row omits meta strip when branch and skill are absent", () => {
  const rows = [row("a")];
  const { lastFrame } = render(
    <ResultList results={rows} cursor={0} noColor={true} listWidth={80}
                maxRows={20} dimRows={false} />
  );
  const frame = lastFrame() ?? "";
  assert.ok(!frame.includes("()"));
});
