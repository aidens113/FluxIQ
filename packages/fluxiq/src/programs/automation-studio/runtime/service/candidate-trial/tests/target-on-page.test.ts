import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowArtifact } from "../../../../model/index.ts";
import type { AutomationStudioGraphExecutionTrace } from "../../../executor/index.ts";
import { AutomationStudioFlowCandidateTrialGate, type AutomationStudioFlowCandidate } from "../../../flow-bootstrap/candidate/index.ts";
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
      happened: "The step could not find its control where it was saved, though one like it is on the page.",
      targetOnPage: true, retryable: true,
      onPage: "Step 2 (\"set the quantity to three\") could not find its control where it was saved, though one like it is on the page. The step itself is right.",
      advice: "Nothing in your script needs to change for this: test this same revision again, unchanged, without acting on the control yourself."
    });
    // The tries it absorbed say the same, never that the control was absent.
    expect((step.absorbed as JsonObject[]).map((entry) => entry.happened)).toEqual(Array(3).fill("The step could not find its control where it was saved, though one like it is on the page."));
    // t426: nothing says how the control was found -- no score, no address, none of the domain's own texts.
    expect(step).not.toHaveProperty("expected");
    expect(step).not.toHaveProperty("actual");
    expect(JSON.stringify(step)).not.toMatch(/address|selector|fingerprint|scor|0\.27|0\.02|#fb1l6ufkg/iu);
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

// t422, paid run R4a's second attempt (`run-mv2pgqkj-f3552c70`, trials 1 and 2): the quantity step was saved as a tag and
// a selector through the box's per-load id, nothing else; the page set the absent id aside, nothing was left to score,
// and the measurement carried 3 same-family controls and no score. The fix is in the domain: a step built from a handle
// now carries the element's whole fingerprint, so the extension finds the control by its other signals. Finding an
// element is the extension's work, never the model's (user, 2026-10-10): the feedback never asks the model to read the
// control again or re-address it. Such a step keeps today's not-found feedback -- try again, which the gate answers
// `retry_allowed` once -- and if it stops there again, the gate closes the revision as for any control not found.

/** The trial's graph with the typing step saved as `element`. */
const graphWith = (element: JsonObject) => ({
  nodes: [graph.nodes[0], { ...graph.nodes[1], parameterValues: { selector: "#fb1l6ufkg", text: "3", element } }]
} as unknown as AutomationStudioFlowArtifact);
const feedbackWith = (element: JsonObject, attempts: Attempt[]) => automationStudioCandidateTrialFeedback.executionFailed({ code: "candidate.execution_incomplete", start: "reset", graph: graphWith(element),
  trace: { status: "failed", startedAt: 1, values: {}, effects: [], attempts: [{ ...open }, ...attempts] } }).feedback;
/** The domain's failure for that step, word for word: no score, and the resolution names only the family it weighed. */
const unscoredNotFound: Failure = { ...notFound, actual: "nothing matched; 3 control(s) of the same family are on the page; the execution did not recover within its 5 attempts after absorbing target_absent ×5, waiting 3750 ms" };
const R4A_TRIES = ["t1", "t2", "t3", "t4"].map((id) => typing(id, { strategy: "fingerprint", candidateCount: 3 }, unscoredNotFound));
const addressOnly = { tagName: "input", selector: "#fb1l6ufkg" };

describe("trial feedback for a step that scored no control at all", () => {
  it("rebuilds R4a's second attempt: today's not-found feedback, retryable, and nothing that asks the model to find the control", () => {
    const step = (feedbackWith(addressOnly, R4A_TRIES).steps as JsonObject[]).at(-1)!;
    expect(step).toMatchObject({ step: 2, status: "failed", attempts: 4, failureCode: "web.target.not_found", happened: "The step's control was not found on the page.", retryable: true });
    for (const key of ["targetOnPage", "onPage", "advice"]) expect(step).not.toHaveProperty(key);
    // Nothing in this feedback asks the model to find or re-address the control, and since t426 the domain's own
    // `expected` and `actual`, which say how it looked for the control, are not passed on for a target not found.
    expect(step).not.toHaveProperty("expected");
    expect(step).not.toHaveProperty("actual");
    expect(JSON.stringify(step)).not.toMatch(/fingerprint|selector|address|read the control again|look for the control|another way to find/iu);
  });

  it("the trial's answer is retry_allowed once, and the same stop again closes the revision to re-testing", async () => {
    const candidate = { revision: 4, digest: "8d633994" } as unknown as AutomationStudioFlowCandidate;
    const gate = new AutomationStudioFlowCandidateTrialGate({
      latest: () => candidate,
      trial: { candidateId: "candidate.r4a", port: async () => ({ revision: 4, digest: "8d633994", verdict: "execution_failed", trialRunId: "trial", feedback: feedbackWith(addressOnly, R4A_TRIES) }) }
    });
    const first = await gate.test({ revision: 4, digest: "8d633994" });
    expect(first.resultReason).toBe("retry_allowed");
    expect((first.evidence as JsonObject).instruction).toMatch(/If it may, test this same revision again/u);
    const second = await gate.test({ revision: 4, digest: "8d633994" });
    expect(second.resultReason).toBeUndefined();
    expect(second.evidence).toMatchObject({ failedStep: { step: 2, failureCode: "web.target.not_found" }, retestsLeft: 0 });
    expect((await gate.test({ revision: 4, digest: "8d633994" })).resultCode).toBe("candidate.trial_same_failure");
  });
});
