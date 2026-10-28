import { expect, test } from "vitest";
import { ACTIVITY_DOUBTED_HEADLINE, endsOnDoubt } from "../doubted-ending.ts";
import { activityHeadline } from "../headline.ts";
import { TEST_HOST_WORDS } from "./test-host-words.ts";

test("a run the check only doubted, with the Flow unchanged, does not read 'Couldn't fix your Flow'", () => {
  expect(activityHeadline("run", "failed", TEST_HOST_WORDS, { repairing: true, doubted: true })).toBe(ACTIVITY_DOUBTED_HEADLINE);
  expect(activityHeadline("run", "failed", TEST_HOST_WORDS, { repairing: true })).toBe("Couldn't fix your Flow");
  expect(activityHeadline("build", "failed", TEST_HOST_WORDS, { doubted: true })).toBe("Build failed");
});

test("the ending is recognised in a row's label or text", () => {
  expect(endsOnDoubt("Run failed: it saved 3 rows, but the check doubted them, the repair changed nothing, and the saved Flow is unchanged.")).toBe(true);
  expect(endsOnDoubt(undefined, "Run failed")).toBe(false);
});
