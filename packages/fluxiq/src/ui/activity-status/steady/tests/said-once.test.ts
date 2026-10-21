// Coverage of said-once.ts: a sentence whose later clause only says again what
// an earlier one said is said once; a clause that adds something stays.

import { expect, test } from "vitest";

import { activitySaidOnce } from "../said-once.ts";

test("a clause that repeats an earlier one is dropped, and the sentence keeps its end", () => {
  expect(activitySaidOnce("FluxIQ could not finish the Flow: I could not finish this.")).toBe("FluxIQ could not finish the Flow.");
  expect(activitySaidOnce("The step didn't work: it did not work")).toBe("The step didn't work");
  expect(activitySaidOnce("FluxIQ could not finish the Flow. I could not finish this.")).toBe("FluxIQ could not finish the Flow.");
});

test("a clause that adds something stays", () => {
  for (const kept of ["Build failed: no list was found", "FluxIQ could not finish the Flow: the item is out of stock.", "Waiting for you: finish the check on the page", "Opening the page"]) {
    expect(activitySaidOnce(kept)).toBe(kept);
  }
});
