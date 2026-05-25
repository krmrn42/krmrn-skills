import { test } from "node:test";
import assert from "node:assert/strict";
import {
  projectDisplay, shortSession, fmtDate, colorizeSnippet,
  ANSI_BOLD, ANSI_RESET, SNIPPET_OPEN, SNIPPET_CLOSE,
} from "../../src/core/format.js";

test("projectDisplay: 2+ path parts → last two", () => {
  assert.equal(projectDisplay("/home/user/project", ""), "user/project");
});

test("projectDisplay: 1 path part → project name fallback", () => {
  assert.equal(projectDisplay("/oneproj", "Oneproj"), "Oneproj");
});

test("projectDisplay: empty path → name or '?'", () => {
  assert.equal(projectDisplay("", "Foo"), "Foo");
  assert.equal(projectDisplay("", ""), "?");
});

test("shortSession truncates to 8 chars", () => {
  assert.equal(shortSession("abcdef1234567890"), "abcdef12");
  assert.equal(shortSession(""), "????????");
  assert.equal(shortSession(null), "????????");
});

test("fmtDate handles seconds + ms", () => {
  const ms = 1700000000000;
  const s = 1700000000;
  assert.equal(fmtDate(ms), fmtDate(s));
  assert.equal(fmtDate(0), "????-??-??");
});

test("colorizeSnippet with color wraps markers in ANSI", () => {
  const input = `foo ${SNIPPET_OPEN}bar${SNIPPET_CLOSE} baz`;
  const out = colorizeSnippet(input, true);
  assert.ok(out.includes(ANSI_BOLD));
  assert.ok(out.includes(ANSI_RESET));
});

test("colorizeSnippet without color preserves marker text", () => {
  const out = colorizeSnippet(`foo ${SNIPPET_OPEN}x${SNIPPET_CLOSE}`, false);
  assert.equal(out, `foo ${SNIPPET_OPEN}x${SNIPPET_CLOSE}`);
});
