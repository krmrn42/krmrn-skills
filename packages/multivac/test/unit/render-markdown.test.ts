import { test } from "node:test";
import assert from "node:assert/strict";
import { renderMarkdown } from "../../src/core/render/markdown.js";
import type { ResultRow, ProjectHeader, MoreRow, Selectable } from "../../src/core/types.js";

function chat(opts: Partial<ResultRow> = {}): ResultRow {
  return {
    kind: "chat", source: "claude", sessionId: "abc-123",
    projectPath: "/work/frontend", projectName: "frontend",
    lastActivity: 1700000000, msgCount: 47, snippet: "", score: 0,
    title: "react-router-fix", gitBranch: "main", recapText: "refactored Router",
    ...opts,
  };
}
function project(opts: Partial<ProjectHeader> = {}): ProjectHeader {
  return {
    kind: "project", projectPath: "/work/frontend", projectName: "frontend",
    chatCount: 12, lastActivity: 1700000000,
    topChatTitles: ["react-router-fix", "oauth-debug", "deploy-staging"],
    ...opts,
  };
}
function more(remaining: number): MoreRow {
  return { kind: "more", projectPath: "/work/frontend", remainingCount: remaining };
}

test("renderMarkdown: empty rows emits 'no matches' message", () => {
  const out = renderMarkdown({ rows: [], query: "router" });
  assert.ok(out.includes("no matches"));
});

test("renderMarkdown: project header becomes a `##` heading with path", () => {
  const out = renderMarkdown({ rows: [project()], query: "" });
  assert.ok(out.includes("## /work/frontend"));
  assert.ok(out.includes("12 chats"));
});

test("renderMarkdown: heading includes 'matching \"...\"' when query is non-empty", () => {
  const out = renderMarkdown({ rows: [project()], query: "router" });
  assert.ok(out.includes('matching "router"'));
});

test("renderMarkdown: project entry includes 'New chat here' resume one-liner", () => {
  const out = renderMarkdown({ rows: [project()], query: "" });
  assert.ok(out.includes("New chat here: `(cd /work/frontend && claude)`"));
});

test("renderMarkdown: chat entry under a project includes Resume one-liner with --resume", () => {
  const rows: Selectable[] = [project(), chat()];
  const out = renderMarkdown({ rows, query: "" });
  assert.ok(out.includes("`(cd /work/frontend && claude --resume abc-123)`"));
});

test("renderMarkdown: chat entry shows recap when present", () => {
  const rows: Selectable[] = [project(), chat()];
  const out = renderMarkdown({ rows, query: "" });
  assert.ok(out.includes("recap: refactored Router"));
});

test("renderMarkdown: gitBranch annotated when present", () => {
  const rows: Selectable[] = [project(), chat({ gitBranch: "feat/x" })];
  const out = renderMarkdown({ rows, query: "" });
  assert.ok(out.includes("(feat/x)"));
});

test("renderMarkdown: MoreRow renders as '(N more)' inside its project section", () => {
  const rows: Selectable[] = [project({ chatCount: 5 }), chat(), more(4)];
  const out = renderMarkdown({ rows, query: "" });
  assert.ok(out.includes("(4 more)"));
});

test("renderMarkdown: multiple projects each get their own heading + chat list", () => {
  const rows: Selectable[] = [
    project({ projectPath: "/work/frontend", projectName: "frontend" }),
    chat({ sessionId: "a1" }),
    project({ projectPath: "/work/backend", projectName: "backend" }),
    chat({ sessionId: "b1", projectPath: "/work/backend", projectName: "backend" }),
  ];
  const out = renderMarkdown({ rows, query: "" });
  assert.ok(out.includes("## /work/frontend"));
  assert.ok(out.includes("## /work/backend"));
  assert.ok(out.includes("--resume a1"));
  assert.ok(out.includes("--resume b1"));
});

test("renderMarkdown: chats are numbered within their project (1., 2., …)", () => {
  const rows: Selectable[] = [
    project({ chatCount: 2 }),
    chat({ sessionId: "a", title: "first" }),
    chat({ sessionId: "b", title: "second" }),
  ];
  const out = renderMarkdown({ rows, query: "" });
  assert.ok(out.includes("1. **first**"));
  assert.ok(out.includes("2. **second**"));
});
