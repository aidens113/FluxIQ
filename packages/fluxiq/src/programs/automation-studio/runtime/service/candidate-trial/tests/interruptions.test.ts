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
      { kind: "rate_limit", wayOut: "t901", said: "The site's notice asking the run to slow down was over the page, and the run closed it by pressing its way out, t901." },
      { kind: "promotion", said: "A promotion was over the page, and the run closed it by itself. No control of it is named, so no step of the Flow is needed to close it." }
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

// t661, A8 bigbox cart (`run-mvac0ddx-f52ba929`): an optional step's control was gone, so the client cleared the layers
// over the page, among them the store picker the Flow's own step had just opened, and the step said "The page put a
// dialog in the way ... t334": Core never knew the page put it there, and nothing said t334 closed the picker. A layer
// is now said as over the page, with its own name, and -- where the domain marks it opened by this run -- as the layer
// the nearest earlier step that acted opened. A library fixture: a branch list a step opens.
describe("whose layer the run closed", () => {
  const branchList = { kind: "dialog" as const, control: "Close", name: "Choose your branch", wayOut: "way-out.7" };
  /** The dismiss attempt of an optional step, its dispatch's own report marking the branch list as opened by this run. */
  const dismissing = (runOpened?: boolean | string): Attempt => ({
    ...attempt("d1", "succeeded", [branchList]), nodeId: "dismiss",
    outputs: { result: { clearedLayers: [{ kind: "dialog", control: "Close", name: "Choose your branch", wayOut: "way-out.7", ...(runOpened === undefined ? {} : { runOpened }) }] } }
  });

  it("names a layer the domain marks as opened by this run as the given step's, and says closing it undid that step", () => {
    expect(automationStudioTrialInterruptions([dismissing(true)], { "way-out.7": "t334" }, 2)).toEqual([{
      kind: "dialog", wayOut: "t334", openedByStep: 2,
      said: "A dialog (\"Choose your branch\"), a layer step 2 opened, was over the page, and the run closed it by pressing its way out, t334. Closing it undid what step 2 had opened."
    }]);
  });

  it("never says the page put it there, and attributes no step where the domain did not mark it or no step acted before", () => {
    for (const said of [automationStudioTrialInterruptions([dismissing(undefined)], { "way-out.7": "t334" }, 2), automationStudioTrialInterruptions([dismissing("yes")], {}, 2), automationStudioTrialInterruptions([dismissing(true)], {})]) {
      expect(said).toHaveLength(1);
      expect(said[0]).not.toHaveProperty("openedByStep");
      expect(String(said[0]!.said)).toMatch(/^A dialog \("Choose your branch"\) was over the page/u);
      expect(String(said[0]!.said)).not.toMatch(/page put|step \d+ opened/u);
    }
  });

  it("is said on the step in the trial feedback as the nearest earlier step that acted, passing over a skipped one", () => {
    const flow = { nodes: [
      { id: "list", definitionId: "web.output.dom-click", parameterValues: { element: { tagName: "button", visibleText: "Choose branch" } } },
      { id: "skipped", definitionId: "web.output.dom-click", parameterValues: { element: { tagName: "button", visibleText: "Not now" } } },
      { id: "dismiss", definitionId: "web.output.dom-click", parameterValues: { element: { tagName: "button", visibleText: "No thanks" } } }
    ] } as unknown as AutomationStudioFlowArtifact;
    const skipped: Attempt = { ...attempt("s1", "succeeded"), nodeId: "skipped", route: "skipped", skipped: { reason: "target_absent", code: "web.target.not_found" } };
    const { feedback } = automationStudioCandidateTrialFeedback.executionFailed({ code: "candidate.execution_incomplete", start: "reset", graph: flow, wayOuts: { "way-out.7": "t334" },
      trace: trace([{ ...attempt("l1", "succeeded"), nodeId: "list" }, skipped, dismissing(true)]) });
    expect((feedback.steps as JsonObject[])[2]).toMatchObject({ interruptions: [{ kind: "dialog", wayOut: "t334", openedByStep: 1 }] });
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
