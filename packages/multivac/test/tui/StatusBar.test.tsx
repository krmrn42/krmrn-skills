import React from "react";
import { test } from "node:test";
import assert from "node:assert/strict";
import { render } from "ink-testing-library";
import { StatusBar } from "../../src/tui/components/StatusBar.js";
import claudeSource from "../../src/sources/claude/index.js";

const deps = {
  dangerouslySkipPermissions: false,
  tmuxAvailable: false,
  getSource: (id: string) => (id === "claude" ? claudeSource : undefined),
};

test("StatusBar shows resume + nav bindings for Claude row", () => {
  const row = {
    source: "claude", sessionId: "x", projectPath: "/p",
    projectName: "p", lastActivity: 0, msgCount: 0, snippet: "", score: 0,
  };
  const { lastFrame } = render(<StatusBar deps={deps} selectedRow={row} cols={120} />);
  const frame = lastFrame() ?? "";
  assert.ok(frame.includes("Enter resume"), "expected 'Enter resume' in frame");
  assert.ok(frame.includes("Ctrl-O print id"), "expected 'Ctrl-O print id' in frame");
});

test("StatusBar hides Ctrl-W when tmux unavailable", () => {
  const row = {
    source: "claude", sessionId: "x", projectPath: "/p",
    projectName: "p", lastActivity: 0, msgCount: 0, snippet: "", score: 0,
  };
  const { lastFrame } = render(<StatusBar deps={{ ...deps, tmuxAvailable: false }} selectedRow={row} cols={120} />);
  assert.ok(!(lastFrame() ?? "").includes("tmux-window"), "tmux-window should be hidden");
});

test("StatusBar shows Ctrl-W when tmux available", () => {
  const row = {
    source: "claude", sessionId: "x", projectPath: "/p",
    projectName: "p", lastActivity: 0, msgCount: 0, snippet: "", score: 0,
  };
  const { lastFrame } = render(<StatusBar deps={{ ...deps, tmuxAvailable: true }} selectedRow={row} cols={120} />);
  assert.ok((lastFrame() ?? "").includes("tmux-window"), "tmux-window should be visible");
});
