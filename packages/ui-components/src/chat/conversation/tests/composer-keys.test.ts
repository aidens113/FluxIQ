// The composer's keys: Enter sends, Shift+Enter is a new line, and no Enter
// sends while an input method is composing, however the browser says so.

import assert from "node:assert/strict";
import { test } from "vitest";
import { composerKeyAction } from "../composer-keys.ts";

test("Enter sends and Shift+Enter leaves the new line to the box", () => {
  assert.equal(composerKeyAction({ key: "Enter", shiftKey: false }, false), "send");
  assert.equal(composerKeyAction({ key: "Enter", shiftKey: true }, false), "none");
});

test("other keys are the box's", () => {
  for (const key of ["a", " ", "Tab", "ArrowUp", "Escape"]) assert.equal(composerKeyAction({ key, shiftKey: false }, false), "none", key);
});

test("an Enter that confirms a composition never sends", () => {
  assert.equal(composerKeyAction({ key: "Enter", shiftKey: false, isComposing: true }, false), "none");
  assert.equal(composerKeyAction({ key: "Enter", shiftKey: false, keyCode: 229 }, false), "none");
  assert.equal(composerKeyAction({ key: "Enter", shiftKey: false, isComposing: false }, true), "none");
  // Once the composition ended, the next Enter sends.
  assert.equal(composerKeyAction({ key: "Enter", shiftKey: false, isComposing: false, keyCode: 13 }, false), "send");
});
