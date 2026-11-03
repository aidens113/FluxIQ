// "Step N of M" is 1-based, and just "Step N" past the count or without one.

import assert from "node:assert/strict";
import { test } from "vitest";
import { stepText } from "../step-text.ts";

test("Step N of M is 1-based, and just Step N past the count or without one", () => {
  assert.equal(stepText({ index: 1, count: 3 }), "Step 1 of 3");
  assert.equal(stepText({ index: 3, count: 3 }), "Step 3 of 3");
  assert.equal(stepText({ index: 4, count: 3 }), "Step 4");
  assert.equal(stepText({ index: 2, count: 0 }), "Step 2");
  assert.equal(stepText({ index: 2, count: Number.NaN }), "Step 2");
  assert.equal(stepText({ index: 0, count: 3 }), undefined);
  assert.equal(stepText({ index: 1.5, count: 3 }), undefined);
  assert.equal(stepText(undefined), undefined);
  assert.equal(stepText({ index: 1, count: 2, label: "   " }), "Step 1 of 2");
});
