import { describe, expect, it } from "vitest";
import * as published from "../../index.ts";
import { AUTOMATION_STUDIO_FLOW_BOOTSTRAP_MAX_DURATION_MS, AUTOMATION_STUDIO_PROJECT_BUILD_ENDING_MS, AUTOMATION_STUDIO_PROJECT_BUILD_MAX_DURATION_MS } from "../index.ts";

// A project build runs a supervisor and several builders, trials and resets,
// and had no bound of its own; the Lab's chat waited a candidate build's ten
// minutes and lost three of four A8 launch 7 project builds to it (t592). The
// bound is thirty minutes, and its last five are kept for the ending.
describe("a project build's time limit", () => {
  it("is thirty minutes, published for a reader that waits for a build", () => {
    expect(AUTOMATION_STUDIO_PROJECT_BUILD_MAX_DURATION_MS).toBe(1_800_000);
    expect(published.AUTOMATION_STUDIO_PROJECT_BUILD_MAX_DURATION_MS).toBe(AUTOMATION_STUDIO_PROJECT_BUILD_MAX_DURATION_MS);
  });

  it("keeps five minutes of it for the ending, leaving the work more than any one loop's deadline", () => {
    expect(AUTOMATION_STUDIO_PROJECT_BUILD_ENDING_MS).toBe(300_000);
    expect(AUTOMATION_STUDIO_PROJECT_BUILD_MAX_DURATION_MS - AUTOMATION_STUDIO_PROJECT_BUILD_ENDING_MS).toBeGreaterThan(AUTOMATION_STUDIO_FLOW_BOOTSTRAP_MAX_DURATION_MS);
  });
});
