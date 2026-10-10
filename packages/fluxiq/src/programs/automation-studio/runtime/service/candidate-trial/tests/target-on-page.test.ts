import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowArtifact } from "../../../../model/index.ts";
import type { AutomationStudioGraphExecutionTrace } from "../../../executor/index.ts";
import { automationStudioCandidateTrialFeedback } from "../index.ts";

// t420, paid run R4a (`run-mv2nlh9l-52e476da`, 0038): the one trial stopped at the typing step with
// `web.target.not_found` after 4 attempts. Its saved address quoted an id the page mints again on every load, and the
// domain weighed the 3 same-family controls on the page, the closest at 0.27. The feedback said only that the control
// was not found, and the model never tested again. A step whose control the domain measured still on the page now says
// so, says the script need not change, and is retryable.

type Attempt = AutomationStudioGraphExecutionTrace["attempts"][number];
type Failure = NonNullable<Attempt["failure"]>;

const graph = {
  nodes: [
    { id: "open", definitionId: "web.output.browser-navigate", label: "open the item page", parameterValues: { url: "http://shop.test/item/1" } },
    { id: "type", definitionId: "web.output.dom-type", label: "set the quantity to three", parameterValues: { text: "3", element: { tagName: "input" } } }
  ]
} as unknown as AutomationStudioFlowArtifact;

/** The domain's failure for R4a's step, word for word. */
const notFound: Failure = {
  category: "target_not_found", code: "web.target.not_found", retryable: true, stage: "target_resolution",
  expected: "an element matching selector #fb1l6ufkg, element fingerprint",
  actual: "nothing matched; 3 control(s) of the same family are on the page; best scored 0.27"
};
const open: Attempt = { attemptId: "a1", nodeId: "open", definitionId: "web.output.browser-navigate", startedAt: 1, status: "succeeded", inputs: {}, outputs: {}, effects: [] };
/** One failed try of the typing step; `resolution` is what the domain returned beside the action result. */
const typing = (attemptId: string, resolution?: JsonObject, failure: Failure = notFound): Attempt => ({
  attemptId, nodeId: "type", definitionId: "web.output.dom-type", startedAt: 2, status: "failed", inputs: {}, effects: [], failure: { ...failure },
  outputs: { outputId: "web.dom.type", ok: false, result: { result: { status: "failed", ...(resolution ? { resolution } : {}) } } }
});
const measured = { strategy: "fingerprint", candidateCount: 3, bestScore: 0.27, runnerUpScore: 0.02, confidence: 0.6 };
const lastStep = (attempts: Attempt[]) => (automationStudioCandidateTrialFeedback.executionFailed({ code: "candidate.execution_incomplete", start: "reset", graph,
  trace: { status: "failed", startedAt: 1, values: {}, effects: [], attempts: [{ ...open }, ...attempts] } }).feedback.steps as JsonObject[]).at(-1)!;

describe("trial feedback for a step that could not find a control still on the page", () => {
  it("rebuilds R4a: says the control is on the page, that the script need not change, and that the step is retryable", () => {
    const step = lastStep(["t1", "t2", "t3", "t4"].map((id) => typing(id, measured)));
    expect(step).toMatchObject({
      step: 2, definitionId: "web.output.dom-type", label: "set the quantity to three", status: "failed", attempts: 4, failureCode: "web.target.not_found",
      happened: "The step could not find its control by the address it was saved with, though the control is on the page.",
      targetOnPage: true, retryable: true,
      onPage: "Step 2 (\"set the quantity to three\") could not find its control by the address it was saved with, though the control is on the page: of the 3 control(s) like it there, the closest matched the saved one at 0.27, well ahead of the next at 0.02. The address is out of date, not the step.",
      advice: "Nothing in your script needs to change for this: test this same revision again, before looking for the control or acting on it."
    });
    // The tries it absorbed say the same, never that the control was absent.
    expect((step.absorbed as JsonObject[]).map((entry) => entry.happened)).toEqual(Array(3).fill("The step could not find its control by the address it was saved with, though the control is on the page."));
  });

  it("marks it retryable even when the domain called the failure not retryable", () => {
    expect(lastStep([typing("t1", measured, { ...notFound, retryable: false })])).toMatchObject({ targetOnPage: true, retryable: true });
  });

  it("reads the measurement from an earlier try when the last one carries none", () => {
    expect(lastStep([typing("t1", measured), typing("t2")])).toMatchObject({ targetOnPage: true });
  });

  it.each([
    ["no measurement at all", undefined],
    ["no control of the same family on the page", { strategy: "fingerprint", candidateCount: 0 }],
    ["a closest control that does not match", { strategy: "fingerprint", candidateCount: 2, bestScore: 0.05 }],
    ["a closest control the page contradicts", { strategy: "fingerprint", candidateCount: 4, bestScore: -0.4 }],
    ["two controls alike, neither ahead", { strategy: "fingerprint", candidateCount: 2, bestScore: 0.3, runnerUpScore: 0.28 }],
    ["a measurement that is not the domain's shape", { candidateCount: "3", bestScore: "0.27" }]
  ])("keeps today's feedback for a target that is genuinely absent: %s", (_name, resolution) => {
    const step = lastStep([typing("t1", resolution as JsonObject | undefined, { ...notFound, retryable: false })]);
    expect(step).toMatchObject({ failureCode: "web.target.not_found", happened: "The step's control was not found on the page.", retryable: false });
    expect(step).not.toHaveProperty("targetOnPage");
    expect(step).not.toHaveProperty("onPage");
    expect(step).not.toHaveProperty("advice");
  });

  it("says nothing of this about a step that failed some other way", () => {
    const step = lastStep([typing("t1", measured, { category: "action_failed", code: "web.action.failed", retryable: false })]);
    expect(step).not.toHaveProperty("targetOnPage");
    expect(step).toMatchObject({ happened: "The step ran and did not work.", retryable: false });
  });
});
