// What the post-run check reads of the Flow and of the page the run ended on
// (run `run-murwd8le-79e735a8`, Causes 7 and 8).
//
// 0071 and 0072 judged a cart run from fifteen status rows and a `flowShape`
// in lexical node order -- s1, s10, s11, s12, s13, s14, s2 ... s9 -- so Add to
// cart read before the search, and with no page: not `Cart (3)`, not the
// coupon's "Collected". 0071 then invented a quantity that was never committed.
import { describe, expect, it } from "vitest";
import type { JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowEdge, AutomationStudioFlowNode } from "../../../model/index.ts";
import { summarizeAutomationStudioRunResult, type AutomationStudioRunResultSummaryWithEndView } from "../result-summary.ts";
import { harness, verify } from "./run-outcome-harness.ts";

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
