import { describe, expect, it } from "vitest";
import type { AutomationStudioNodeAttemptTrace } from "../../../executor/index.ts";
import { automationStudioTrialExecutedSteps } from "../index.ts";

let next = 0;
function attempt(nodeId: string, status: "succeeded" | "failed", extra: Partial<AutomationStudioNodeAttemptTrace> = {}): AutomationStudioNodeAttemptTrace {
  return { attemptId: `a${++next}`, nodeId, definitionId: `test.${nodeId}`, startedAt: next, status, inputs: {}, outputs: {}, effects: [], ...extra };
}

describe("a trial's attempts folded into steps", () => {
  it("folds a retry of a failed step into it, keeping the failed attempt as absorbed", () => {
    const failed = attempt("press", "failed"), retry = attempt("press", "succeeded");
    const steps = automationStudioTrialExecutedSteps([attempt("open", "succeeded"), failed, retry]);
    expect(steps).toHaveLength(2);
    expect(steps[1]).toEqual({ attempt: retry, attempts: 2, absorbed: [{ failed, retry }] });
  });

  it("counts a node reached again after it succeeded as a new step", () => {
    const steps = automationStudioTrialExecutedSteps([attempt("press", "succeeded"), attempt("press", "succeeded")]);
    expect(steps.map((step) => step.attempts)).toEqual([1, 1]);
  });

  it("carries the loop pass a step ran in, and drops it once the loop leaves its body", () => {
    const passOne = { item: { name: "first" } };
    const steps = automationStudioTrialExecutedSteps([
      attempt("loop", "succeeded", { definitionId: "builtin.control.for-each", route: "body", outputs: passOne }),
      attempt("press", "succeeded"),
      attempt("loop", "succeeded", { definitionId: "builtin.control.for-each", route: "done", outputs: {} }),
      attempt("after", "succeeded")
    ]);
    expect(steps.map((step) => step.pass)).toEqual([undefined, passOne, passOne, undefined]);
  });

  it("answers no steps for no attempts", () => {
    expect(automationStudioTrialExecutedSteps([])).toEqual([]);
  });
});
