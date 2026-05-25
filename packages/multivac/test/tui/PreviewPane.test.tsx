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
});

test("PreviewPane renders ASCII box when noColor=true", () => {
  const { lastFrame } = render(
    <PreviewPane previewText="hello" width={40} maxRows={10}
                 noColor={true} />
  );
  const f = lastFrame() ?? "";
  assert.ok(!f.includes("╭"), "no rounded chars in no-color mode");
});
