// Coverage of headline.ts: what a unit of work is called while it works and
// how it settles, by its kind and situation.

import { expect, test } from "vitest";

import { activityHeadline } from "../headline.ts";
import { TEST_HOST_WORDS } from "./test-host-words.ts";

test("a terminal cancellation says stopped rather than failed or ready", () => {
  expect(activityHeadline("build", "failed", TEST_HOST_WORDS, { stopped: true })).toBe("Build stopped");
  expect(activityHeadline("run", "failed", TEST_HOST_WORDS, { stopped: true })).toBe("Run stopped");
});

test("a run's recovery that fails reads \"Couldn't fix your Flow\"", () => {
  expect(activityHeadline("run", null, TEST_HOST_WORDS, { repairing: true })).toBe("Fixing your Flow");
  expect(activityHeadline("run", "failed", TEST_HOST_WORDS, { repairing: true })).toBe("Couldn't fix your Flow");
  expect(activityHeadline("run", "failed", TEST_HOST_WORDS)).toBe("Run failed");
});

// t195 `run-musp474o-e0ed7432` (12-failure-scenario): a creation build ended
// unfinished during its repair rounds and the overlay said "Couldn't fix your
// Flow", though no Flow existed to fix. A build's repair re-authors the Flow
// the build is making; when the build fails, the build failed.
test("a build that fails while it repairs settles on the build's own failure headline", () => {
  expect(activityHeadline("build", null, TEST_HOST_WORDS, { repairing: true })).toBe("Fixing your Flow");
  expect(activityHeadline("build", "failed", TEST_HOST_WORDS, { repairing: true })).toBe("Build failed");
  expect(activityHeadline("build", "failed", TEST_HOST_WORDS)).toBe("Build failed");
});

test("a run held for the person reads 'Paused: your turn on the page'", () => {
  expect(activityHeadline("run", "waiting", TEST_HOST_WORDS, { waitingOn: "paused" })).toBe("Paused: your turn on the page");
  expect(activityHeadline("run", "waiting", TEST_HOST_WORDS, { waitingOn: "check" })).toBe(TEST_HOST_WORDS.check);
});

test("a question or a check is said in the words of the host that draws it, never another's", () => {
  const panel = { answer: "Answer in the panel", check: "Finish the check on the page" };
  const inside = { answer: "Waiting for your answer", check: "Finish the check in your browser" };
  for (const words of [panel, inside]) {
    expect(activityHeadline("run", "waiting", words)).toBe(words.answer);
    expect(activityHeadline("run", "waiting", words, { waitingOn: "answer" })).toBe(words.answer);
    expect(activityHeadline("build", "waiting", words, { waitingOn: "check" })).toBe(words.check);
    // A pause, and every headline that is not a wait, are the same in every host.
    expect(activityHeadline("run", "waiting", words, { waitingOn: "paused" })).toBe("Paused: your turn on the page");
    expect(activityHeadline("build", null, words)).toBe("Building your Flow");
  }
});
