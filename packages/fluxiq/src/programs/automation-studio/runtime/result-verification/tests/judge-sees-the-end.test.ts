// What the post-run check reads of the Flow and of the page the run ended on
// (run `run-murwd8le-79e735a8`, Causes 7 and 8).
//
// 0071 and 0072 judged a cart run from fifteen status rows and a `flowShape`
// in lexical node order -- s1, s10, s11, s12, s13, s14, s2 ... s9 -- so Add to
// cart read before the search, and with no page: not `Cart (3)`, not the
// coupon's "Collected". 0071 then invented a quantity that was never committed.
//
// And the page it started on (`startView`; run `run-mux6pndp-16feb842`): both
// judges read the header's "2 · $28.96" -- a soap and exploration's 3-Pack,
// already in the cart -- as the two towel packs the run was asked to add.
import { describe, expect, it } from "vitest";
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowEdge, AutomationStudioFlowNode } from "../../../model/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../../executor/index.ts";
import { summarizeAutomationStudioRunResult, type AutomationStudioRunResultSummaryWithEndView } from "../result-summary.ts";
import { harness, session, verify } from "./run-outcome-harness.ts";
// After the modules under test: loaded first, the llm barrel is met mid-cycle and arrives without its screens.
import { automationStudioLlmRequestEvidenceRefusal } from "../../llm/index.ts";

const DENIED = ["html", "cookies", "selector"];

/** The run's fourteen nodes as the store returned them: by id, lexically. */
const ids = ["s1", "s10", "s11", "s12", "s13", "s14", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9"];
const nodes: AutomationStudioFlowNode[] = ids.map((id) => ({ id, definitionId: `step.${id}` }));
/** The chain the run executed, s1 to s14, with s2 a sometimes-present step that s3 merges. */
const edges: AutomationStudioFlowEdge[] = [
  ...Array.from({ length: 13 }, (_, index) => ({ id: `e${index + 1}`, sourceNodeId: `s${index + 1}`, targetNodeId: `s${index + 2}`, sourcePortId: "success" })),
  { id: "skip", sourceNodeId: "s2", targetNodeId: "s3", sourcePortId: "failed" }
];
const RUN_ORDER = Array.from({ length: 14 }, (_, index) => `s${index + 1}`);

const PAGE = "PAGE \"Voltbay USB C Hub\"\nt885 link \"3 Cart\" ~/cart\nt965 field \"Quantity\" =\"3\"\nt970 \"Collected\"";

describe("the post-run check's flowShape", () => {
  it("lists the nodes in the order the Flow runs them, not in the order the store keeps them", () => {
    const summary = summarizeAutomationStudioRunResult({ recordSets: [], flowNodes: nodes, flowEdges: edges });
    expect(summary.flowShape.map((step) => step.nodeId)).toEqual(RUN_ORDER);
  });

  it("puts a branch's steps after the step they branch from, and a loop's return edge changes nothing", () => {
    const branch: AutomationStudioFlowNode[] = ["d", "c", "b", "a"].map((id) => ({ id, definitionId: id }));
    const summary = summarizeAutomationStudioRunResult({
      recordSets: [],
      flowNodes: branch,
      flowEdges: [
        { id: "1", sourceNodeId: "a", targetNodeId: "b", sourcePortId: "success" },
        { id: "2", sourceNodeId: "a", targetNodeId: "c", sourcePortId: "failed" },
        { id: "3", sourceNodeId: "b", targetNodeId: "d" },
        { id: "4", sourceNodeId: "c", targetNodeId: "d" },
        { id: "5", sourceNodeId: "d", targetNodeId: "b", sourcePortId: "repeat" }
      ]
    });
    expect(summary.flowShape.map((step) => step.nodeId)).toEqual(["a", "b", "c", "d"]);
  });

  it("keeps the authored order where no edges are given", () => {
    const summary = summarizeAutomationStudioRunResult({ recordSets: [], flowNodes: nodes });
    expect(summary.flowShape.map((step) => step.nodeId)).toEqual(ids);
  });

  it("reaches the judge in run order from the run's own Flow", async () => {
    const context = harness({ answer: "yes" });
    const stored: AutomationStudioFlowDocument = { schemaVersion: "0.1", flowId: "flow-1", ownerKind: "task", ownerId: "task-1", name: "Cart", nodes, edges, createdAt: 1, updatedAt: 1 };
    await verify(context, { flow: stored });
    expect(context.requests[0]?.context.resultSummary?.flowShape.map((step) => step.nodeId)).toEqual(RUN_ORDER);
  });
});

describe("the page the run ended on", () => {
  const ended = (view: JsonValue, declared: { deniedEvidenceKeys?: readonly string[] } = { deniedEvidenceKeys: DENIED }): AutomationStudioRunResultSummaryWithEndView =>
    summarizeAutomationStudioRunResult({ recordSets: [], endView: { view, after: "s14" }, ...declared });

  it("is carried whole, as the domain produced it, with the step it was taken after", () => {
    const summary = ended({ page: PAGE });
    expect(summary.endView).toEqual({ after: "s14", view: { page: PAGE } });
    expect(summary.withheld).toBe(false);
  });

  it("is not carried without a declaration of denied keys, and the summary says something was withheld", () => {
    const summary = ended({ page: PAGE }, {});
    expect(summary.endView).toBeUndefined();
    expect(summary.withheld).toBe(true);
  });

  it("is not carried when it holds a denied key or a credential-shaped value", () => {
    for (const view of [{ page: PAGE, cookies: "session=1" }, { page: `${PAGE}\nt990 "sk-live-4f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c"` }]) {
      const summary = ended(view);
      expect(summary.endView).toBeUndefined();
      expect(summary.withheld).toBe(true);
    }
  });

  it("reaches the post-run check from the port that reads it, and the run is judged without one when the read fails", async () => {
    const context = harness({ answer: "yes" });
    const asked: Array<{ projectId: string; runId: string; flowId: string }> = [];
    await verify(context, { ports: { ...context.ports, deniedEvidenceKeys: DENIED, readEndView: async (input) => { asked.push(input); return { view: { page: PAGE }, after: "n3" }; } } });
    expect(asked).toEqual([{ projectId: "project-1", runId: "run-1", flowId: "flow-1" }]);
    const sent = context.requests[0]?.context.resultSummary as AutomationStudioRunResultSummaryWithEndView | undefined;
    expect(sent?.endView).toEqual({ after: "n3", view: { page: PAGE } });

    const failing = harness({ answer: "yes" });
    const next = await verify(failing, { ports: { ...failing.ports, readEndView: async () => { throw new Error("tab closed"); } } });
    expect(failing.requests).toHaveLength(1);
    expect((failing.requests[0]?.context.resultSummary as AutomationStudioRunResultSummaryWithEndView | undefined)?.endView).toBeUndefined();
    // A failed read is said as something withheld, never as a page with nothing on it.
    expect(failing.requests[0]?.context.resultSummary?.withheld).toBe(true);
    expect(next.metadata?.resultVerification).toMatchObject({ status: "confirmed" });
  });
});

describe("the page the run started on", () => {
  const BLANK = "PAGE \"New Tab\"";
  const START = "PAGE \"Pickup\"\nt885 link \"2 · $28.96\" ~/cart";
  const LATER = "PAGE \"Towels 2-Pack\"\nt885 link \"4 · $52.90\" ~/cart";
  /** The web domain's snapshot summary: its compact view, with keys beside it that are not the view. */
  const snapshot = (page: string) => ({ stateSnapshotId: "web.state.1", stateRef: "web.state.1@a:before_action", capturedAt: 1, summary: { schemaVersion: "web-llm-page.v3", trust: "untrusted_page_content", page, documentTimeOrigin: 17 } });
  const step = (nodeId: string, stateRefs?: { before?: string; after?: string; diff?: JsonObject }): AutomationStudioNodeAttemptTrace => ({
    attemptId: `a.${nodeId}`, nodeId, definitionId: `step.${nodeId}`, startedAt: 1, status: "succeeded", inputs: {}, outputs: {}, effects: [],
    ...(stateRefs ? { stateRefs: { ...(stateRefs.before ? { beforeAction: snapshot(stateRefs.before) } : {}), ...(stateRefs.after ? { afterAction: snapshot(stateRefs.after) } : {}), ...(stateRefs.diff ? { stateDiff: stateRefs.diff } : {}) } } : {})
  });
  /** An LLM step that never touched the page, then a step that opens the store, then an add. */
  const opened = (diff: JsonObject): AutomationStudioNodeAttemptTrace[] => [
    step("s0"),
    step("s1", { before: BLANK, after: START, diff }),
    step("s2", { before: START, after: LATER, diff: { documentChanged: false, locationChanged: false, added: "t885 link \"4 · $52.90\"", removed: "t885 link \"2 · $28.96\"" } })
  ];
  const started = (attempts: AutomationStudioNodeAttemptTrace[], fields: { observedStateKeys?: readonly string[]; deniedEvidenceKeys?: readonly string[] } = { observedStateKeys: ["page"], deniedEvidenceKeys: DENIED }) =>
    summarizeAutomationStudioRunResult({ recordSets: [], sessionAttempts: attempts, ...fields });

  it("is the page the first step that saw the page left, when that step moved to another document, by the declared view keys", () => {
    const summary = started(opened({ documentChanged: true, locationChanged: true }));
    expect(summary.startView).toEqual({ view: { page: START } });
    expect(summary.withheld).toBe(false);
  });

  it("is the page that step found when it stayed on its document, even where its address changed; a diff without documentChanged is judged by its address", () => {
    expect(started(opened({ documentChanged: false, locationChanged: true })).startView).toEqual({ view: { page: BLANK } });
    expect(started(opened({ locationChanged: true })).startView).toEqual({ view: { page: START } });
    expect(started(opened({ locationChanged: false })).startView).toEqual({ view: { page: BLANK } });
  });

  it("is none when nothing was captured, or the domain declared no view keys", () => {
    expect(started([step("s0"), step("s1")]).startView).toBeUndefined();
    expect(started([]).startView).toBeUndefined();
    expect(started(opened({ documentChanged: true }), { deniedEvidenceKeys: DENIED }).startView).toBeUndefined();
  });

  it("is cut to the keys the end view holds when the caller names no view keys (the post-run check's ports carry none)", () => {
    const attempts = opened({ documentChanged: true });
    const summary = summarizeAutomationStudioRunResult({ recordSets: [], sessionAttempts: attempts, deniedEvidenceKeys: DENIED, endView: { after: "s2", view: { page: LATER } } });
    expect(summary.startView).toEqual({ view: { page: START } });
    expect(summarizeAutomationStudioRunResult({ recordSets: [], sessionAttempts: attempts, deniedEvidenceKeys: DENIED }).startView).toBeUndefined();
  });

  it("is screened as the end view is: none without a declaration of denied keys, or holding a credential, and either says withheld", () => {
    const undeclared = started(opened({ documentChanged: true }), { observedStateKeys: ["page"] });
    expect(undeclared.startView).toBeUndefined();
    expect(undeclared.withheld).toBe(true);
    const secret = started([step("s1", { before: `${START}\nt990 "sk-live-4f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c"` })]);
    expect(secret.startView).toBeUndefined();
    expect(secret.withheld).toBe(true);
  });

  it("reaches the post-run check from the session's own trace, under the domain's declared view keys, and the request still leaves", async () => {
    const context = harness({ answer: "yes" });
    const trace = { status: "succeeded" as const, startedAt: 1, attempts: opened({ documentChanged: true, locationChanged: true }), values: {}, effects: [] };
    await verify(context, { session: session({ trace }), ports: { ...context.ports, deniedEvidenceKeys: DENIED, observedStateKeys: ["page"] } });
    expect(context.requests[0]?.context.resultSummary?.startView).toEqual({ view: { page: START } });
    expect(automationStudioLlmRequestEvidenceRefusal(context.requests[0]!)).toBeUndefined();
  });
});
