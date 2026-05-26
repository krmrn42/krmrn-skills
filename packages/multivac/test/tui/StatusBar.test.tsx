import React from "react";
import { test } from "node:test";
import assert from "node:assert/strict";
import { render } from "ink-testing-library";
import { StatusBar } from "../../src/tui/components/StatusBar.js";
import { buildStatusBar } from "../../src/tui/state/keybindings.js";
import claudeSource from "../../src/sources/claude/index.js";

function claudeSourceStub() {
  return claudeSource;
}

const deps = {
  dangerouslySkipPermissions: false,
  tmuxAvailable: false,
  getSource: (id: string) => (id === "claude" ? claudeSource : undefined),
};

test("StatusBar shows resume + nav bindings for Claude row", () => {
  const row = {
    kind: "chat" as const,
    source: "claude", sessionId: "x", projectPath: "/p",
    projectName: "p", lastActivity: 0, msgCount: 0, snippet: "", score: 0,
  };
  // Use buildStatusBar directly to avoid ink-testing-library's fixed terminal
  // width causing mid-label line wrapping on the longer action bar.
  const lines = buildStatusBar(deps, row, 200);
  const text = lines.join(" ");
  assert.ok(text.includes("Enter resume"), "expected 'Enter resume' in status bar");
  assert.ok(text.includes("Ctrl-O print id"), "expected 'Ctrl-O print id' in status bar");
  // Spot-check the Ink rendering path produces at least some output.
  const { lastFrame } = render(<StatusBar deps={deps} selectedRow={row} cols={200} />);
  assert.ok((lastFrame() ?? "").includes("Enter resume"), "expected 'Enter resume' in frame");
});

test("StatusBar hides Ctrl-W when tmux unavailable", () => {
  const row = {
    kind: "chat" as const,
    source: "claude", sessionId: "x", projectPath: "/p",
    projectName: "p", lastActivity: 0, msgCount: 0, snippet: "", score: 0,
  };
  const { lastFrame } = render(<StatusBar deps={{ ...deps, tmuxAvailable: false }} selectedRow={row} cols={120} />);
  assert.ok(!(lastFrame() ?? "").includes("tmux-window"), "tmux-window should be hidden");
});

test("StatusBar shows Ctrl-W when tmux available", () => {
  const row = {
    kind: "chat" as const,
    source: "claude", sessionId: "x", projectPath: "/p",
    projectName: "p", lastActivity: 0, msgCount: 0, snippet: "", score: 0,
  };
  const { lastFrame } = render(<StatusBar deps={{ ...deps, tmuxAvailable: true }} selectedRow={row} cols={120} />);
  assert.ok((lastFrame() ?? "").includes("tmux-window"), "tmux-window should be visible");
});

test("StatusBar: N new-chat visible on a chat row", () => {
  const sel = { kind: "chat", source: "claude", sessionId: "x", projectPath: "/p",
    projectName: "p", lastActivity: 0, msgCount: 0, snippet: "", score: 0 } as const;
  const lines = buildStatusBar(
    { dangerouslySkipPermissions: false, tmuxAvailable: false, getSource: () => claudeSourceStub() },
    sel as any, 200,
  );
  assert.ok(lines.join(" ").includes("N new-chat"));
});

test("StatusBar: N new-chat visible on a dir row", () => {
  const sel = { kind: "dir", projectPath: "/p", projectName: "p",
    chatCount: 1, lastActivity: 0, topChatTitles: [] } as const;
  const lines = buildStatusBar(
    { dangerouslySkipPermissions: false, tmuxAvailable: false, getSource: () => claudeSourceStub() },
    sel as any, 200,
  );
  assert.ok(lines.join(" ").includes("N new-chat"));
});

test("StatusBar: N new-chat hidden on a section header", () => {
  const sel = { kind: "section", label: "working dirs" } as const;
  const lines = buildStatusBar(
    { dangerouslySkipPermissions: false, tmuxAvailable: false, getSource: () => claudeSourceStub() },
    sel as any, 200,
  );
  assert.ok(!lines.join(" ").includes("N new-chat"));
});
