import React from "react";
import { test } from "node:test";
import assert from "node:assert/strict";
import { render } from "ink-testing-library";
import { PreviewPane } from "../../src/tui/components/PreviewPane.js";

test("PreviewPane renders rounded box characters when not noColor", () => {
  const { lastFrame } = render(
    <PreviewPane previewText="hello\nworld" width={40} maxRows={10}
                 noColor={false} />
  );
  const f = lastFrame() ?? "";
  assert.ok(f.includes("╭") || f.includes("╮"),
    "expected rounded box chars, got: " + f);
  assert.ok(f.includes("hello"), "expected body content 'hello' to render");
});

test("PreviewPane renders ASCII box when noColor=true", () => {
  const { lastFrame } = render(
    <PreviewPane previewText="hello" width={40} maxRows={10}
                 noColor={true} />
  );
  const f = lastFrame() ?? "";
  assert.ok(!f.includes("╭"), "no rounded chars in no-color mode");
});

import { test as test2 } from "node:test";
import { renderProjectPreview } from "../../src/core/render/project-preview.js";
import { DatabaseSync } from "node:sqlite";
import { ensureSchema } from "../../src/indexer/state.js";
import type { ProjectHeader } from "../../src/core/types.js";

function seedDir(db: DatabaseSync) {
  db.prepare(
    "INSERT INTO messages (id, conversation_id, project_path, project_name, " +
      "timestamp, type, content, message_uuid, parent_uuid, source) " +
      "VALUES (?, ?, '/work/frontend', 'frontend', ?, ?, ?, ?, NULL, 'claude')"
  ).run("1", "c1", 100, "user", "investigate router crash", "1");
  db.prepare(
    "INSERT INTO messages (id, conversation_id, project_path, project_name, " +
      "timestamp, type, content, message_uuid, parent_uuid, source) " +
      "VALUES (?, ?, '/work/frontend', 'frontend', ?, ?, ?, ?, NULL, 'claude')"
  ).run("2", "c1", 200, "assistant", "found the bug in Router.tsx", "2");
}

test2("renderProjectPreview: header lists path and chat count", () => {
  const db = new DatabaseSync(":memory:");
  ensureSchema(db);
  seedDir(db);
  const dir: ProjectHeader = {
    kind: "project", projectPath: "/work/frontend", projectName: "frontend",
    chatCount: 1, lastActivity: 200, topChatTitles: ["investigate router crash"],
  };
  const out = renderProjectPreview(db, dir, false);
  assert.ok(out.includes("/work/frontend"));
  assert.ok(out.includes("1 chat"));
});

test2("renderProjectPreview: lists recent chat titles", () => {
  const db = new DatabaseSync(":memory:");
  ensureSchema(db);
  seedDir(db);
  const dir: ProjectHeader = {
    kind: "project", projectPath: "/work/frontend", projectName: "frontend",
    chatCount: 1, lastActivity: 200, topChatTitles: ["investigate router crash"],
  };
  const out = renderProjectPreview(db, dir, false);
  assert.ok(out.includes("investigate router crash"));
});

test2("renderProjectPreview: includes per-chat recap snippets when available", () => {
  const db = new DatabaseSync(":memory:");
  ensureSchema(db);
  // Seed a chat with an away_summary so getRecapText returns a real recap.
  db.prepare(
    "INSERT INTO messages (id, conversation_id, project_path, project_name, " +
      "timestamp, type, content, message_uuid, parent_uuid, source, subtype) " +
      "VALUES (?, ?, '/work/frontend', 'frontend', ?, ?, ?, ?, NULL, 'claude', ?)"
  ).run("u1", "c1", 100, "user", "questions about the router", "u1", null);
  db.prepare(
    "INSERT INTO messages (id, conversation_id, project_path, project_name, " +
      "timestamp, type, content, message_uuid, parent_uuid, source, subtype) " +
      "VALUES (?, ?, '/work/frontend', 'frontend', ?, ?, ?, ?, NULL, 'claude', ?)"
  ).run("s1", "c1", 200, "system", "added an error boundary", "s1", "away_summary");
  const dir: ProjectHeader = {
    kind: "project", projectPath: "/work/frontend", projectName: "frontend",
    chatCount: 1, lastActivity: 200, topChatTitles: [],
  };
  const out = renderProjectPreview(db, dir, false);
  assert.ok(out.includes("recap: added an error boundary"));
});

test2("renderProjectPreview: includes the 'new chat here' hint", () => {
  const db = new DatabaseSync(":memory:");
  ensureSchema(db);
  seedDir(db);
  const dir: ProjectHeader = {
    kind: "project", projectPath: "/work/frontend", projectName: "frontend",
    chatCount: 0, lastActivity: 0, topChatTitles: [],
  };
  const out = renderProjectPreview(db, dir, false);
  assert.ok(out.includes("Enter: new chat here"));
});
