import { describe, expect, it } from "vitest";
import { automationStudioRunDetailStepCount } from "../index.ts";

describe("automationStudioRunDetailStepCount", () => {
  it("counts every row when no row names a parent", () => {
    expect(automationStudioRunDetailStepCount([{ attemptId: "a" }, { attemptId: "b" }])).toBe(2);
    expect(automationStudioRunDetailStepCount([])).toBe(0);
  });

  it("counts a container's children and not the container, at every depth", () => {
    expect(automationStudioRunDetailStepCount([
      { attemptId: "call" },
      { attemptId: "call:a", parentAttemptId: "call" },
      { attemptId: "call:inner", parentAttemptId: "call" },
      { attemptId: "call:inner:b", parentAttemptId: "call:inner" },
      { attemptId: "done" }
    ])).toBe(3);
  });
});
