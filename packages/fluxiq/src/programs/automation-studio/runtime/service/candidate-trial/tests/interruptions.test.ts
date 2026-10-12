// t470, lane D round 8 (`run-mv5jnc5m-a47c3e59`, t465 defect 2): the client closed the site's slow-down notice by its
// way out, the trial feedback said nothing of it, and the model, told to add a step closing the notice, pressed the only
// close-like handle it had ever seen -- the chat's "Close chat". A step now says what the run closed over the page and,
// when the domain could name it, the handle of the way out the client pressed.

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowArtifact } from "../../../../model/index.ts";
import type { AutomationStudioGraphExecutionTrace, AutomationStudioNodeAttemptTrace } from "../../../executor/index.ts";
import { automationStudioCandidateTrialFeedback, automationStudioTrialInterruptions, automationStudioTrialWayOuts, runAutomationStudioCandidateTrial } from "../index.ts";
import type { AutomationStudioCandidateTrialPorts } from "../contracts.ts";
import { trialFixture } from "./fixtures.ts";

type Attempt = AutomationStudioNodeAttemptTrace;
const attempt = (id: string, status: Attempt["status"], clearedLayers?: Attempt["clearedLayers"]): Attempt => ({
  attemptId: id, nodeId: "confirm", definitionId: "web.output.dom-click", startedAt: 1, status, inputs: {}, outputs: {}, effects: [],
  ...(status === "failed" ? { failure: { category: "action_failed", code: "web.action.rate_limited", retryable: true, retryAfterMs: 6_000 } } : {}),
  ...(clearedLayers ? { clearedLayers } : {})
});

const graph = { nodes: [{ id: "confirm", definitionId: "web.output.dom-click", parameterValues: { element: { tagName: "button", visibleText: "Confirm" } } }] } as unknown as AutomationStudioFlowArtifact;
const trace = (attempts: Attempt[]): AutomationStudioGraphExecutionTrace => ({ status: "failed", startedAt: 1, values: {}, effects: [], attempts });

describe("what a step's run closed over the page", () => {
  it("names the way out by the handle the domain gave, and says the run closed a layer it could not name by itself", () => {
    const said = automationStudioTrialInterruptions([
      attempt("a1", "failed", [{ kind: "rate_limit", control: "OK", wayOut: "way-out.1" }]),
      attempt("a2", "succeeded", [{ kind: "promotion", control: "No thanks", wayOut: "way-out.2" }])
    ], { "way-out.1": "t901" });
    expect(said).toEqual([
      { kind: "rate_limit", wayOut: "t901", said: "The page put the site's notice asking the run to slow down in the way, and the run closed it by pressing its way out, t901." },
      { kind: "promotion", said: "The page put a promotion in the way, and the run closed it by itself. No control of it is named, so no step of the Flow is needed to close it." }
    ]);
  });

  it("says each layer once per kind and way out, never the words the client matched, and at most four", () => {
    const layers = [{ kind: "rate_limit" as const, control: "OK", wayOut: "way-out.1" }];
    expect(automationStudioTrialInterruptions([attempt("a1", "failed", layers), attempt("a2", "failed", layers)], { "way-out.1": "t901" })).toHaveLength(1);
    const many = (["consent", "promotion", "assistant", "dialog", "rate_limit"] as const).map((kind) => ({ kind, control: "Close" }));
    const said = automationStudioTrialInterruptions([attempt("a1", "succeeded", many)]);
    expect(said).toHaveLength(4);
    expect(JSON.stringify(said)).not.toMatch(/"Close"|\bOK\b/u);
    expect(automationStudioTrialInterruptions([attempt("a1", "succeeded")])).toEqual([]);
  });

  it("collects each way-out reference once, in order", () => {
    expect(automationStudioTrialWayOuts([
      attempt("a1", "failed", [{ kind: "rate_limit", control: "OK", wayOut: "way-out.1" }, { kind: "dialog", control: "Close" }]),
      attempt("a2", "succeeded", [{ kind: "rate_limit", control: "OK", wayOut: "way-out.1" }, { kind: "promotion", control: "Skip", wayOut: "way-out.2" }])
    ])).toEqual(["way-out.1", "way-out.2"]);
  });

  it("lists them on the step in the trial feedback, from the retried attempt and the one it got past", () => {
    const { feedback } = automationStudioCandidateTrialFeedback.executionFailed({ code: "candidate.execution_incomplete", start: "not_reset", graph, wayOuts: { "way-out.1": "t901" },
      trace: trace([attempt("a1", "failed", [{ kind: "rate_limit", control: "OK", wayOut: "way-out.1" }]), attempt("a2", "succeeded")]) });
    const step = (feedback.steps as JsonObject[])[0]!;
    expect(step).toMatchObject({ status: "succeeded", attempts: 2, interruptions: [{ kind: "rate_limit", wayOut: "t901" }] });
    expect(step.absorbed).toHaveLength(1);
  });

  it("lists no interruptions on a step whose run closed nothing", () => {
    const { feedback } = automationStudioCandidateTrialFeedback.executionFailed({ code: "candidate.execution_incomplete", start: "not_reset", graph, trace: trace([attempt("a1", "succeeded")]) });
    expect((feedback.steps as JsonObject[])[0]).not.toHaveProperty("interruptions");
  });
});

describe("a trial asks the domain to name the ways out its run pressed", () => {
  const executed = (attempts: Attempt[]): NonNullable<AutomationStudioCandidateTrialPorts["execute"]> => async (input) => ({
    receipt: { identity: input.identity, runId: input.runId, startReceiptId: input.start.receiptId, startedAt: 1, finishedAt: 2, status: "failed", executedNodeCount: attempts.length, commands: [] },
    code: "candidate.execution_incomplete", trace: trace(attempts), graph
  });

  it("hands the references to the domain once and names the handles it answered", async () => {
    const fixture = trialFixture();
    const asked: string[][] = [];
    fixture.ports.execute = executed([attempt("a1", "failed", [{ kind: "rate_limit", control: "OK", wayOut: "way-out.1" }]), attempt("a2", "succeeded", [{ kind: "rate_limit", control: "OK", wayOut: "way-out.1" }])]);
    fixture.ports.clearedControlHandles = async (wayOuts) => {
      asked.push([...wayOuts]);
      return { "way-out.1": "t901" };
    };
    const { result } = await runAutomationStudioCandidateTrial(fixture.request(), fixture.ports);
    expect(asked).toEqual([["way-out.1"]]);
    expect((result.feedback.steps as JsonObject[])[0]).toMatchObject({ interruptions: [{ kind: "rate_limit", wayOut: "t901" }] });
  });

  it("asks nothing when the run pressed no way out, and names no handle the domain left out", async () => {
    const quiet = trialFixture();
    let asked = 0;
    quiet.ports.execute = executed([attempt("a1", "succeeded")]);
    quiet.ports.clearedControlHandles = async () => {
      asked++;
      return {};
    };
    await runAutomationStudioCandidateTrial(quiet.request(), quiet.ports);
    expect(asked).toBe(0);

    const unnamed = trialFixture();
    unnamed.ports.execute = executed([attempt("a1", "succeeded", [{ kind: "rate_limit", control: "OK", wayOut: "way-out.1" }])]);
    unnamed.ports.clearedControlHandles = async () => ({});
    const { result } = await runAutomationStudioCandidateTrial(unnamed.request(), unnamed.ports);
    expect((result.feedback.steps as JsonObject[])[0]).toMatchObject({ interruptions: [{ kind: "rate_limit", said: expect.stringContaining("closed it by itself") }] });
    expect((result.feedback.steps as JsonObject[])[0]!.interruptions).toEqual([expect.not.objectContaining({ wayOut: expect.anything() })]);
  });
});
