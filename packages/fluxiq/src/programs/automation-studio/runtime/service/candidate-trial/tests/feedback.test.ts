import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowArtifact } from "../../../../model/index.ts";
import type { AutomationStudioGraphExecutionTrace } from "../../../executor/index.ts";
import { automationStudioCandidateTrialFeedback } from "../index.ts";

// Lane A round 4 (`run-muyrpbnk-fef374e7`, 0032 and 0048): the model was told only "step 2, dom-click, failed,
// web.target.not_found" and then "web.action.rate_limited". C4: each step names the control it acted on and what
// happened in plain words, and a failure says whether trying the same act again may pass.

const graph = {
  nodes: [
    { id: "open", definitionId: "web.output.browser-navigate", parameterValues: { url: "http://shop.test/item/1" } },
    { id: "coupon", definitionId: "web.output.dom-click", parameterValues: { target: { selector: "#coupon" }, element: { tagName: "button", visibleText: "Get  coupons\n" } } }
  ]
} as unknown as AutomationStudioFlowArtifact;

function trace(failure: NonNullable<AutomationStudioGraphExecutionTrace["attempts"][number]["failure"]>): AutomationStudioGraphExecutionTrace {
  return {
    status: "failed", startedAt: 1, values: {}, effects: [],
    attempts: [
      { attemptId: "a1", nodeId: "open", definitionId: "web.output.browser-navigate", startedAt: 1, status: "succeeded", inputs: {}, outputs: {}, effects: [] },
      { attemptId: "a2", nodeId: "coupon", definitionId: "web.output.dom-click", startedAt: 2, status: "failed", inputs: {}, outputs: {}, effects: [], message: "Network busy, please try again (page words)", failure }
    ]
  };
}

describe("trial feedback for a step that failed", () => {
  it("names the step's control and says what happened, and that trying again may pass, without the failure's page message", () => {
    const { feedback } = automationStudioCandidateTrialFeedback.executionFailed({ code: "candidate.execution_incomplete", start: "reset", graph,
      trace: trace({ category: "action_failed", code: "web.action.rate_limited", retryable: true, expected: "the press to be accepted", actual: "the page refused it as busy" }) });
    expect(feedback.steps).toEqual([
      { step: 1, definitionId: "web.output.browser-navigate", status: "succeeded" },
      { step: 2, definitionId: "web.output.dom-click", control: "Get coupons", status: "failed", failureCode: "web.action.rate_limited", happened: "The step ran and did not work.",
        expected: "the press to be accepted", actual: "the page refused it as busy", retryable: true }
    ]);
    expect(JSON.stringify(feedback)).not.toContain("Network busy");
  });

  it("says in words that the control was not found, and that the same act would not pass unchanged", () => {
    const { feedback } = automationStudioCandidateTrialFeedback.executionFailed({ code: "candidate.execution_incomplete", start: "reset", graph,
      trace: trace({ category: "target_not_found", code: "web.target.not_found", retryable: false }) });
    expect((feedback.steps as unknown[])[1]).toMatchObject({ control: "Get coupons", failureCode: "web.target.not_found", happened: "The step's control was not found on the page.", retryable: false });
  });
});

// Lane A round 5 (`run-muz0f12h-eae63685`, 0022 and 0028): the coupon press was refused busy, retried at once and
// succeeded, yet the feedback listed the refusal as "step 6 failed" and the retry as a new "step 7". Since t355 a node
// may make up to four attempts; a step is listed once, with its final outcome and how many attempts it took.
describe("trial feedback counts steps, not attempts", () => {
  type Attempt = AutomationStudioGraphExecutionTrace["attempts"][number];
  type Failure = NonNullable<Attempt["failure"]>;
  const busy: Failure = { category: "action_failed", code: "web.action.rate_limited", retryable: true, expected: "the page accepts the press", actual: "the page answered that it was busy" };
  const open: Attempt = { attemptId: "a1", nodeId: "open", definitionId: "web.output.browser-navigate", startedAt: 1, status: "succeeded", inputs: {}, outputs: {}, effects: [] };
  const coupon = (attemptId: string, failure?: Failure): Attempt => ({
    attemptId, nodeId: "coupon", definitionId: "web.output.dom-click", startedAt: 2, status: failure ? "failed" : "succeeded", inputs: {}, outputs: {}, effects: [], ...(failure ? { failure } : {})
  });

  it("reads a press refused busy and then accepted as one succeeded step that took 2 attempts", () => {
    const { feedback } = automationStudioCandidateTrialFeedback.executionFailed({ code: "candidate.execution_incomplete", start: "reset", graph,
      trace: { status: "failed", startedAt: 1, values: {}, effects: [], attempts: [{ ...open }, coupon("a2", busy), coupon("a3")] } });
    expect(feedback.steps).toEqual([
      { step: 1, definitionId: "web.output.browser-navigate", status: "succeeded" },
      { step: 2, definitionId: "web.output.dom-click", control: "Get coupons", status: "succeeded", attempts: 2 }
    ]);
    expect(JSON.stringify(feedback)).not.toContain("rate_limited");
  });

  it("reads a step that failed after all its attempts as one failed step with its final reason", () => {
    const { feedback } = automationStudioCandidateTrialFeedback.executionFailed({ code: "candidate.execution_incomplete", start: "reset", graph,
      trace: { status: "failed", startedAt: 1, values: {}, effects: [], attempts: [{ ...open }, coupon("a2", busy), coupon("a3", busy), coupon("a4", busy),
        coupon("a5", { category: "target_not_found", code: "web.target.not_found", retryable: false })] } });
    expect(feedback.steps).toEqual([
      { step: 1, definitionId: "web.output.browser-navigate", status: "succeeded" },
      { step: 2, definitionId: "web.output.dom-click", control: "Get coupons", status: "failed", attempts: 4, failureCode: "web.target.not_found",
        happened: "The step's control was not found on the page.", retryable: false }
    ]);
  });

  it("lists a node the run reached again after it succeeded as a new step", () => {
    const { feedback } = automationStudioCandidateTrialFeedback.executionFailed({ code: "candidate.execution_incomplete", start: "reset", graph,
      trace: { status: "failed", startedAt: 1, values: {}, effects: [], attempts: [{ ...open }, coupon("a2"), coupon("a3")] } });
    expect((feedback.steps as Array<{ step: number; attempts?: number }>).map((step) => [step.step, step.attempts])).toEqual([[1, undefined], [2, undefined], [3, undefined]]);
  });
});
