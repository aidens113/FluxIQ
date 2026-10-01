// The judgement a repair's first decision reads, whole. The user's order,
// 2026-09-30: "Remove ANY AND ALL LIMITS ON THE NUMBER OF ELEMENTS PASSED TO
// MODEL. DO NOT HIDE INFORMATION." Until then the codes and the acts still to do
// stopped at sixteen each.
import { describe, expect, it } from "vitest";
import { automationStudioFlowBootstrapJudgementValue } from "../judgement.ts";

describe("the judgement a repair reads", () => {
  it("carries every act still to do and every code, not the first sixteen", () => {
    const todo = Array.from({ length: 40 }, (_unused, index) => `a${index + 1}`);
    const codes = Array.from({ length: 30 }, (_unused, index) => `bootstrap.code_${index}`);
    const value = automationStudioFlowBootstrapJudgementValue({
      round: 1,
      stopped: "iterations",
      tested: "replay_failed",
      testIssueCodes: codes,
      failedSteps: [2, 3],
      stepsInFlow: 5,
      done: 1,
      todo,
      lastIssueCodes: codes
    });
    expect(value.actsTodo).toEqual(todo);
    expect(value.testIssueCodes).toEqual(codes);
    expect(value.lastRefusedFor).toEqual(codes);
  });
});
