import { test } from "node:test";
import assert from "node:assert/strict";
import { renderMarkdown } from "../../src/core/render/markdown.js";
import type { ResultRow, DirRow } from "../../src/core/types.js";

function chat(opts: Partial<ResultRow> = {}): ResultRow {
  return {
    kind: "chat", source: "claude", sessionId: "abc-123",
    projectPath: "/work/frontend", projectName: "frontend",
    lastActivity: 1700000000, msgCount: 47, snippet: "", score: 0,
    title: "react-router-fix", gitBranch: "main", recapText: "refactored Router",
    ...opts,
  };
}
function dir(opts: Partial<DirRow> = {}): DirRow {
  return {
    kind: "dir", projectPath: "/work/frontend", projectName: "frontend",
    chatCount: 12, lastActivity: 1700000000,
    topChatTitles: ["react-router-fix", "oauth-debug", "deploy-staging"],
    ...opts,
  };
}

test("renderMarkdown: emits Working directories section heading for filtered query", () => {
  const out = renderMarkdown({ dirs: [dir()], chats: [], query: "frontend" });
  assert.ok(out.includes('## Working directories matching "frontend"'));
});

test("renderMarkdown: emits Chats section heading for filtered query", () => {
  const out = renderMarkdown({ dirs: [], chats: [chat()], query: "router" });
  assert.ok(out.includes('## Chats matching "router"'));
});

test("renderMarkdown: empty query uses 'Recent' wording", () => {
  const out = renderMarkdown({ dirs: [dir()], chats: [chat()], query: "" });
  assert.ok(out.includes("## Working directories (recent)"));
  assert.ok(out.includes("## Chats (recent)"));
});

test("renderMarkdown: dir entry includes 'New chat' resume one-liner", () => {
  const out = renderMarkdown({ dirs: [dir()], chats: [], query: "" });
  assert.ok(out.includes("`(cd /work/frontend && claude)`"));
});

test("renderMarkdown: chat entry includes Resume one-liner with --resume", () => {
  const out = renderMarkdown({ dirs: [], chats: [chat()], query: "" });
  assert.ok(out.includes("`(cd /work/frontend && claude --resume abc-123)`"));
});

test("renderMarkdown: chat entry shows recap when present", () => {
  const out = renderMarkdown({ dirs: [], chats: [chat()], query: "" });
  assert.ok(out.includes("recap: refactored Router"));
});

test("renderMarkdown: empty input emits 'no matches' message", () => {
  const out = renderMarkdown({ dirs: [], chats: [], query: "router" });
  assert.ok(out.includes("no matches"));
});

test("renderMarkdown: gitBranch annotated when present", () => {
  const out = renderMarkdown({ dirs: [], chats: [chat({ gitBranch: "feat/x" })], query: "" });
  assert.ok(out.includes("(feat/x)"));
});
