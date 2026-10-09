import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
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

  it("reads a press refused busy and then accepted as one succeeded step that took 2 attempts, and says what it got past", () => {
    const { feedback } = automationStudioCandidateTrialFeedback.executionFailed({ code: "candidate.execution_incomplete", start: "reset", graph,
      trace: { status: "failed", startedAt: 1, values: {}, effects: [], attempts: [{ ...open }, coupon("a2", busy), coupon("a3")] } });
    expect(feedback.steps).toEqual([
      { step: 1, definitionId: "web.output.browser-navigate", status: "succeeded" },
      { step: 2, definitionId: "web.output.dom-click", control: "Get coupons", status: "succeeded", attempts: 2,
        absorbed: [{ failureCode: "web.action.rate_limited", happened: "The step ran and did not work.", said: "The step ran and did not work. The run tried the step again and it went through." }] }
    ]);
  });

  it("reads a step that failed after all its attempts as one failed step with its final reason", () => {
    const { feedback } = automationStudioCandidateTrialFeedback.executionFailed({ code: "candidate.execution_incomplete", start: "reset", graph,
      trace: { status: "failed", startedAt: 1, values: {}, effects: [], attempts: [{ ...open }, coupon("a2", busy), coupon("a3", busy), coupon("a4", busy),
        coupon("a5", { category: "target_not_found", code: "web.target.not_found", retryable: false })] } });
    expect(feedback.steps).toEqual([
      { step: 1, definitionId: "web.output.browser-navigate", status: "succeeded" },
      { step: 2, definitionId: "web.output.dom-click", control: "Get coupons", status: "failed", attempts: 4, failureCode: "web.target.not_found",
        happened: "The step's control was not found on the page.", retryable: false,
        absorbed: [1, 2, 3].map(() => ({ failureCode: "web.action.rate_limited", happened: "The step ran and did not work.", said: "The step ran and did not work." })) }
    ]);
  });

  it("lists a node the run reached again after it succeeded as a new step", () => {
    const { feedback } = automationStudioCandidateTrialFeedback.executionFailed({ code: "candidate.execution_incomplete", start: "reset", graph,
      trace: { status: "failed", startedAt: 1, values: {}, effects: [], attempts: [{ ...open }, coupon("a2"), coupon("a3")] } });
    expect((feedback.steps as Array<{ step: number; attempts?: number }>).map((step) => [step.step, step.attempts])).toEqual([[1, undefined], [2, undefined], [3, undefined]]);
  });
});

// t378, lane D (`run-mv0fuual-f9e6f089`, 0036): two Confirm presses in a loop were refused by the site's "you're going
// too fast" notice, waited out and pressed again, and the model was told only `attempts: 2`. The step now says what
// interrupted it, on which pass and row, the wait taken, that the step then went through, and the pace now in force.
describe("trial feedback for a refusal the run waited out", () => {
  type Attempt = AutomationStudioGraphExecutionTrace["attempts"][number];
  const loopGraph = {
    nodes: [
      { id: "each", definitionId: "builtin.control.for-each" },
      { id: "confirm", definitionId: "web.output.dom-click", label: "Confirm the follow", parameterValues: { element: { tagName: "button", accessibleName: "Confirm" } } }
    ]
  } as unknown as AutomationStudioFlowArtifact;
  const pass = (index: number, item: Attempt["outputs"][string]): Attempt => ({ attemptId: `each.${index}`, nodeId: "each", definitionId: "builtin.control.for-each", startedAt: 1, status: "succeeded", route: "body", inputs: {}, outputs: { item, index, count: 8 }, effects: [] });
  const confirm = (attemptId: string, extra: Partial<Attempt> = {}): Attempt => ({ attemptId, nodeId: "confirm", definitionId: "web.output.dom-click", startedAt: 2, status: "succeeded", inputs: {}, outputs: {}, effects: [], ...extra });
  const refused = (attemptId: string, raisedToMs: number): Attempt => confirm(attemptId, { status: "failed", message: "Slow down! You can confirm again in 5 seconds (page words)",
    failure: { category: "action_failed", code: "web.action.rate_limited", retryable: true, stage: "execution", effect: "unacted", retryAfterMs: 5_500 }, pace: { inForceMs: 0, waitedMs: 0, raisedToMs } });
  const trial: AutomationStudioGraphExecutionTrace = {
    status: "succeeded", startedAt: 1, values: {}, effects: [],
    attempts: [pass(2, { name: "Freya" }), confirm("c3"), pass(3, { name: "  Jonas\n" }), refused("c4", 5_500),
      confirm("c5", { retry: { attemptNumber: 2, maxAttempts: 4, backoffMs: 2_500, rung: "retry_node", previousAttemptId: "c4", hintedWaitMs: 5_500, creditedMs: 3_000 } })],
    pace: [{ nodeId: "confirm", paceMs: 5_500, learnedMs: 5_500, raisedCount: 1, waitedMs: 0 }]
  };

  it("names the refusal in plain words with its pass and row, the wait taken, that the step went through, and the pace now held", () => {
    const { feedback } = automationStudioCandidateTrialFeedback.executionFailed({ code: "candidate.execution_incomplete", start: "reset", graph: loopGraph, trace: trial });
    const steps = feedback.steps as JsonObject[];
    expect(steps.map((step) => [step.definitionId, step.status, step.attempts])).toEqual([
      ["builtin.control.for-each", "succeeded", undefined], ["web.output.dom-click", "succeeded", undefined], ["builtin.control.for-each", "succeeded", undefined], ["web.output.dom-click", "succeeded", 2]
    ]);
    expect(steps[1]).not.toHaveProperty("absorbed");
    expect(steps[3]!.absorbed).toEqual([{
      failureCode: "web.action.rate_limited", happened: "The site asked the run to slow down on pass 4 (Jonas), and to try again in 5.5 s.", pass: 4, row: "Jonas", askedWaitMs: 5_500, waitedMs: 2_500, paceMs: 5_500,
      said: "The site asked the run to slow down on pass 4 (Jonas), and to try again in 5.5 s. The run waited 2.5 s (3.0 s had already passed since the refusal) and tried the step again: it went through, so what the site had shown no longer stood in its way. From then on the run started this step at most once every 5.5 s."
    }]);
    expect(feedback.paces).toEqual([{ definitionId: "web.output.dom-click", label: "Confirm the follow", control: "Confirm", paceMs: 5_500,
      said: "The run learned to start this step at most once every 5.5 s after the site asked it to slow down, and held every later pass to it." }]);
    expect(JSON.stringify(feedback)).not.toContain("Slow down!");
  });

  it("names a pass by its number alone when its row has no words of its own, or they were withheld", () => {
    const withheld = { ...trial, attempts: [pass(0, { [`$datasetRow`]: { datasetId: "people", ordinal: 1 } }), refused("c1", 5_500), confirm("c2")] };
    const { feedback } = automationStudioCandidateTrialFeedback.executionFailed({ code: "candidate.execution_incomplete", start: "reset", graph: loopGraph, trace: withheld });
    expect((feedback.steps as JsonObject[])[1]!.absorbed).toEqual([expect.objectContaining({ pass: 1, happened: "The site asked the run to slow down on pass 1, and to try again in 5.5 s." })]);
    expect((feedback.steps as JsonObject[])[1]!.absorbed).toEqual([expect.not.objectContaining({ row: expect.anything() })]);
  });
});

// t368, lane A round 7 (`run-muz3jyz8-1d363a69`): every trial did every act right and then failed on the model's own
// last step, `wait_for_text "Cart (3)"`, text the page holds only inside a closed mini-cart. The feedback said only
// "the text did not appear before the timeout". A failed check now says what it waited for, whether the domain found
// that text hidden or absent (t369: `textPresence`, `visibleNear`), and that a check confirming the act is not needed.
describe("trial feedback for a check step that failed", () => {
  type Attempt = AutomationStudioGraphExecutionTrace["attempts"][number];
  const timeout = { category: "timeout", code: "web.action.timeout", retryable: true, stage: "execution", expected: "page text containing Cart (3)", actual: "the text did not appear before the timeout" } as const;
  const waitGraph = {
    nodes: [
      { id: "add", definitionId: "web.output.dom-click", parameterValues: { element: { tagName: "button", visibleText: "Add to cart" } } },
      { id: "check", definitionId: "web.output.dom-wait_for_text", parameterValues: { text: "Cart (3)" } },
      { id: "verify", definitionId: "web.output.dom-assert", parameterValues: { assert: { conditions: [{ kind: "text", expected: "Order  placed\n" }] } } }
    ]
  } as unknown as AutomationStudioFlowArtifact;
  const add: Attempt = { attemptId: "a1", nodeId: "add", definitionId: "web.output.dom-click", startedAt: 1, status: "succeeded", inputs: {}, outputs: {}, effects: [] };
  /** The wait, failed four times; each dispatch returned the action result with `reported` on it, as the web domain's `payload.result` (t369). */
  const failedCheck = (reported: JsonObject = {}, nodeId = "check", definitionId = "web.output.dom-wait_for_text"): AutomationStudioGraphExecutionTrace => ({
    status: "failed", startedAt: 1, values: {}, effects: [],
    attempts: [{ ...add }, ...[1, 2, 3, 4].map((n): Attempt => ({ attemptId: `w${n}`, nodeId, definitionId, startedAt: 2, status: "failed", inputs: {}, effects: [], failure: { ...timeout },
      outputs: { outputId: "web.dom.wait_for_text", ok: false, result: { result: { status: "failed", validation: { status: "failed", expected: timeout.expected, actual: timeout.actual }, ...reported } } } }))]
  });
  const lastStep = (trace: AutomationStudioGraphExecutionTrace, graph = waitGraph) => (automationStudioCandidateTrialFeedback.executionFailed({ code: "candidate.execution_incomplete", start: "reset", graph, trace }).feedback.steps as JsonObject[]).at(-1)!;

  it("names the awaited text and says the page did not show it when the domain reports nothing more", () => {
    const step = lastStep(failedCheck());
    expect(step).toMatchObject({ step: 2, definitionId: "web.output.dom-wait_for_text", status: "failed", attempts: 4, failureCode: "web.action.timeout", retryable: true,
      waitedFor: "Cart (3)", seen: "The step waited for \"Cart (3)\", and the page did not show it." });
    expect(step.advice).toContain("A check that only confirms the act before it is not needed: the judge reads the page the run ends on.");
    expect(step).not.toHaveProperty("textPresence");
    expect(step).not.toHaveProperty("visibleNear");
  });

  it("says the text is on the page but hidden, and quotes the visible text most like it (round 7's closed mini-cart)", () => {
    const step = lastStep(failedCheck({ textPresence: "hidden", visibleNear: ["3Cart", "Add to cart"] }));
    expect(step).toMatchObject({ waitedFor: "Cart (3)", textPresence: "hidden", visibleNear: ["3Cart", "Add to cart"],
      seen: "\"Cart (3)\" is on the page but stayed hidden for the whole wait, inside something closed such as a collapsed panel, a menu or a tab. The visible text most like it: \"3Cart\", \"Add to cart\"." });
  });

  it("says the text is not on the page at all when the domain reports it absent", () => {
    const step = lastStep(failedCheck({ textPresence: "absent", visibleNear: ["Added to cart!"] }));
    expect(step).toMatchObject({ textPresence: "absent", visibleNear: ["Added to cart!"], seen: "\"Cart (3)\" is not on the page at all. The visible text most like it: \"Added to cart!\"." });
  });

  it("keeps the domain's bounds, at most three snippets of at most 80 characters, and ignores a presence it does not know", () => {
    const long = `${"x".repeat(100)}`;
    const step = lastStep(failedCheck({ textPresence: "maybe", visibleNear: [long, "  two\n words ", 3, "c", "d"] }));
    expect(step.visibleNear).toEqual(["x".repeat(80), "two words", "c"]);
    expect(step).not.toHaveProperty("textPresence");
  });

  it("reads the fields only from the action result, never from another place that happens to carry them", () => {
    const step = lastStep(failedCheck({ validation: { status: "failed", textPresence: "hidden", visibleNear: ["3Cart"] }, detail: { textPresence: "absent" } }));
    expect(step).not.toHaveProperty("textPresence");
    expect(step).not.toHaveProperty("visibleNear");
    expect(step.seen).toBe("The step waited for \"Cart (3)\", and the page did not show it.");
  });

  it("names the text an assert expected", () => {
    const step = lastStep(failedCheck({}, "verify", "web.output.dom-assert"));
    expect(step).toMatchObject({ definitionId: "web.output.dom-assert", waitedFor: "Order placed", seen: "The step waited for \"Order placed\", and the page did not show it." });
  });

  it("adds nothing of this to a press that failed", () => {
    const step = lastStep({ status: "failed", startedAt: 1, values: {}, effects: [], attempts: [{ ...add, status: "failed", failure: { category: "action_failed", code: "web.action.failed", retryable: true } }] });
    expect(step).not.toHaveProperty("advice");
    expect(step).not.toHaveProperty("waitedFor");
  });
});
