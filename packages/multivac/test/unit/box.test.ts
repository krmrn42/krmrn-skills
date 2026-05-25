import { test } from "node:test";
import assert from "node:assert/strict";
import { ROUNDED, ASCII, pickBox } from "../../src/tui/lib/box.js";

test("ROUNDED uses rounded box-drawing characters", () => {
  assert.equal(ROUNDED.topLeft, "╭");
  assert.equal(ROUNDED.topRight, "╮");
  assert.equal(ROUNDED.bottomLeft, "╰");
  assert.equal(ROUNDED.bottomRight, "╯");
  assert.equal(ROUNDED.horizontal, "─");
  assert.equal(ROUNDED.vertical, "│");
});

test("ASCII uses + and - and |", () => {
  assert.equal(ASCII.topLeft, "+");
  assert.equal(ASCII.horizontal, "-");
  assert.equal(ASCII.vertical, "|");
});

test("pickBox(true) returns ASCII (no-color mode)", () => {
  assert.equal(pickBox(true), ASCII);
});

test("pickBox(false) returns ROUNDED", () => {
  assert.equal(pickBox(false), ROUNDED);
});
