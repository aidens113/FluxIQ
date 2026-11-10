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

test("a wait is never told as a failed save, and a save that failed says why", () => {
  const notes = { state: "notes_only", trust: "unproven", savedAtMs: NOW } as const;
  const waiting = savedWords({ ...notes, why: "still_waiting", earlierKept: true }, NOW);
  assert.equal(waiting, "Saved today: this attempt is not finished, and its steps are saved as a Flow when it ends. The steps saved by the earlier attempt are kept.");
  assert.doesNotMatch(waiting, /could not|failed/u);
  assert.match(savedWords({ ...notes, why: "still_waiting" }, NOW), /No steps are saved yet/u);
  assert.match(savedWords({ ...notes, why: "not_assembled" }, NOW), /did not fit together as a Flow/u);
  assert.match(savedWords({ ...notes, why: "not_saved" }, NOW), /Saving the steps failed/u);
});

test("a step nothing names is counted in words, never quoted by its position or id", () => {
  assert.match(savedWords(partly(["Step 13"]), NOW), /^Saved today: the steps, except one step that did something on the site \(it was left out of the Flow\)\./u);
  assert.match(savedWords(partly(["one step that did something on the site"]), NOW), /except one step that did something on the site \(it was/u);
  assert.match(savedWords(partly(["t622", "d7"]), NOW), /except 2 steps that did something on the site \(they were left out/u);
  assert.match(savedWords(partly(["Save: Table", "Step 4"]), NOW), /except the ones that did "Save: Table" and one step that did something on the site \(they were/u);
  assert.doesNotMatch(savedWords(partly(["Step 13"]), NOW), /Step 13/u);
});
