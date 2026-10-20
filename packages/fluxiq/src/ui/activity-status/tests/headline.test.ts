// Coverage of headline.ts: what a unit of work is called while it works and
// how it settles, by its kind and situation.

import { expect, test } from "vitest";

import { activityHeadline } from "../headline.ts";

test("a terminal cancellation says stopped rather than failed or ready", () => {
  expect(activityHeadline("build", "failed", { stopped: true })).toBe("Build stopped");
  expect(activityHeadline("run", "failed", { stopped: true })).toBe("Run stopped");
});

test("a run's recovery that fails reads \"Couldn't fix your Flow\"", () => {
  expect(activityHeadline("run", null, { repairing: true })).toBe("Fixing your Flow");
  expect(activityHeadline("run", "failed", { repairing: true })).toBe("Couldn't fix your Flow");
  expect(activityHeadline("run", "failed")).toBe("Run failed");
});

// t195 `run-musp474o-e0ed7432` (12-failure-scenario): a creation build ended
// unfinished during its repair rounds and the overlay said "Couldn't fix your
// Flow", though no Flow existed to fix. A build's repair re-authors the Flow
// the build is making; when the build fails, the build failed.
test("a build that fails while it repairs settles on the build's own failure headline", () => {
  expect(activityHeadline("build", null, { repairing: true })).toBe("Fixing your Flow");
  expect(activityHeadline("build", "failed", { repairing: true })).toBe("Build failed");
  expect(activityHeadline("build", "failed")).toBe("Build failed");
});

test("a run held for the person reads 'Paused: your turn on the page'", () => {
  expect(activityHeadline("run", "waiting", { waitingOn: "paused" })).toBe("Paused: your turn on the page");
  expect(activityHeadline("run", "waiting", { waitingOn: "check" })).toBe("Waiting for you: finish the check on the page");
});
