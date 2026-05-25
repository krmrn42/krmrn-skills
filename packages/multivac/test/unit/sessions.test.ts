import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  loadSessionStore, saveSessionStore, migrateLegacyKeys, emptySessionStore,
} from "../../src/core/sessions.js";

function tmpPath(): string {
  return path.join(os.tmpdir(), `multivac-sessions-${Date.now()}-${Math.random()}.json`);
}

test("migrateLegacyKeys: bare ids get `claude:` prefix", () => {
  const store = { version: 1, names: { abc: "Foo", "claude:xyz": "Bar" }, pins: ["abc", "claude:xyz"] };
  const changed = migrateLegacyKeys(store);
  assert.equal(changed, true);
  assert.deepEqual(store.names, { "claude:abc": "Foo", "claude:xyz": "Bar" });
  assert.deepEqual(store.pins, ["claude:abc", "claude:xyz"]);
});

test("migrateLegacyKeys: already-migrated store is unchanged", () => {
  const store = { version: 1, names: { "claude:a": "X" }, pins: ["claude:a"] };
  const changed = migrateLegacyKeys(store);
  assert.equal(changed, false);
});

test("loadSessionStore persists migration to disk", () => {
  const p = tmpPath();
  fs.writeFileSync(p, JSON.stringify({ version: 1, names: { abc: "Foo" }, pins: ["abc"] }));
  try {
    const loaded = loadSessionStore(p);
    assert.deepEqual(loaded.names, { "claude:abc": "Foo" });
    assert.deepEqual(loaded.pins, ["claude:abc"]);
    // Re-read from disk to confirm persistence.
    const onDisk = JSON.parse(fs.readFileSync(p, "utf8"));
    assert.deepEqual(onDisk.names, { "claude:abc": "Foo" });
  } finally {
    fs.unlinkSync(p);
  }
});

test("loadSessionStore returns empty store when file is missing", () => {
  const store = loadSessionStore(tmpPath() + ".missing");
  assert.deepEqual(store, emptySessionStore());
});

test("saveSessionStore writes atomically (no .tmp leftover)", () => {
  const p = tmpPath();
  try {
    saveSessionStore({ version: 1, names: {}, pins: [] }, p);
    assert.ok(fs.existsSync(p));
    assert.equal(fs.existsSync(p + ".tmp"), false);
  } finally {
    fs.unlinkSync(p);
  }
});
