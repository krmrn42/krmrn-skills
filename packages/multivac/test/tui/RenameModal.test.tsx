import React from "react";
import { test } from "node:test";
import assert from "node:assert/strict";
import { render } from "ink-testing-library";
import { RenameModal } from "../../src/tui/components/RenameModal.js";

test("RenameModal renders the keybinding hint line", () => {
  const { lastFrame } = render(<RenameModal />);
  const frame = lastFrame() ?? "";
  assert.ok(frame.includes("Enter save"));
  assert.ok(frame.includes("Esc cancel"));
  assert.ok(frame.includes("clears the saved name"));
});
