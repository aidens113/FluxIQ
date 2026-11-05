// A step that did something lasting and is out of the saved Flow is said so in the saved line.

import assert from "node:assert/strict";
import { test } from "vitest";
import type { ChatSavedState } from "../../ports/index.ts";
import { savedWords } from "../words/index.ts";

const NOW = 1_800_000_000_000;
const partly = (leftOut?: string[]): ChatSavedState => ({ state: "partly_works", trust: "unproven", flowId: "f", savedAtMs: NOW, ...(leftOut ? { leftOut } : {}) });

test("one step left out is named, and said to be out of the Flow", () => {
  assert.equal(
    savedWords(partly(["Save: Round pine dining table"]), NOW),
    'Saved today: the steps, except the one that did "Save: Round pine dining table" (it was left out of the Flow). They have not run on their own yet, so next time I will try them and fix what fails.'
  );
});

test("several are listed, and a long list shows three and counts the rest", () => {
  assert.match(savedWords(partly(["A", "B"]), NOW), /^Saved today: the steps, except the ones that did "A" and "B" \(they were left out of the Flow\)\./u);
  assert.match(savedWords(partly(["A", "B", "C", "D", "E"]), NOW), /did "A", "B", "C" and 2 more \(they were left out/u);
});

test("none, an empty list or a blank name leaves the line as it was", () => {
  const plain = savedWords(partly(), NOW);
  assert.equal(savedWords(partly([]), NOW), plain);
  assert.equal(savedWords(partly(["  "]), NOW), plain);
  assert.match(plain, /^Saved today: the steps\. /u);
});

test("a ready Flow says it too, and notes only has nothing to say", () => {
  const ready: ChatSavedState = { state: "ready", trust: "provisional", flowId: "f", savedAtMs: NOW, lastWorkedAtMs: NOW, leftOut: ["Save"] };
  assert.equal(savedWords(ready, NOW), 'Saved today: the steps, except the one that did "Save" (it was left out of the Flow). They worked last time.');
  assert.match(savedWords({ state: "notes_only", trust: "unproven", savedAtMs: NOW }, NOW), /notes only/u);
});
