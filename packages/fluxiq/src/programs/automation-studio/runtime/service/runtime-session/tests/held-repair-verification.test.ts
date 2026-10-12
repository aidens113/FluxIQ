// What a run whose fixes held is verified against (state-aware recovery plan,
// C6 step 8): the graph its root frame ran with each kept fix on it, under the
// repaired run's check; a dropped fix is not part of it.

import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDocument } from "../../../../model/index.ts";
import type { AutomationStudioRunResultCheck } from "../../runtime-adaptation/index.ts";
import { automationStudioHeldRepairVerification } from "../held-repair-verification.ts";
import { AutomationStudioInRunRepairLedger } from "../in-run-repair-ledger.ts";

const ROOT = ["frame.root"];
const CHILD = ["frame.root", "frame.child"];

function graph(flowId: string, nodeIds: string[], retryCount?: number): AutomationStudioFlowDocument {
  return {
    schemaVersion: "0.1",
    flowId,
    ownerKind: "policy",
    ownerId: "flow.held",
    name: "Graph",
    createdAt: 1,
    updatedAt: 1,
    nodes: nodeIds.map((id) => ({ id, definitionId: "builtin.data.constant", parameterValues: id === "drift" && retryCount !== undefined ? { retryCount } : {} })),
    edges: []
  };
}

const started = graph("graph.main", ["start", "drift", "end"]);
const check = { checked: true, epoch: 3, code: "core.result.check.after_repair", reason: "A repaired run is checked." } as AutomationStudioRunResultCheck;

function request(repairs: string[] | undefined, flow: AutomationStudioFlowDocument = started) {
  return { projectId: "project.held", session: { runId: "run.held", ...(repairs ? { trace: { repairs } } : {}) }, flow };
}

function ledger(...overlays: Array<{ repairId: string; framePath: string[]; graph: AutomationStudioFlowDocument }>): AutomationStudioInRunRepairLedger {
  const kept = new AutomationStudioInRunRepairLedger();
  for (const overlay of overlays) kept.keepOverlay(overlay);
  return kept;
}

describe("the verification of a run that kept a fix", () => {
  it("is the request unchanged for a run that kept none", () => {
    const unchanged = request(undefined);
    const none = request([]);

    expect(automationStudioHeldRepairVerification({ request: unchanged, ledger: ledger({ repairId: "r.1", framePath: ROOT, graph: graph("graph.main", ["start", "drift", "x"]) }), check })).toBe(unchanged);
    expect(automationStudioHeldRepairVerification({ request: none, ledger: undefined, check })).toBe(none);
  });

  it("is judged against the root graph with the kept fix, under the repaired run's check", () => {
    const fixed = graph("graph.main", ["start", "drift", "end"], 2);
    const verified = automationStudioHeldRepairVerification({ request: request(["r.1"]), ledger: ledger({ repairId: "r.1", framePath: ROOT, graph: fixed }), check });

    expect(verified.flow.nodes.find((node) => node.id === "drift")?.parameterValues).toEqual({ retryCount: 2 });
    expect(verified.flow).toMatchObject({ flowId: "graph.main", name: "Graph" });
    expect(verified).toMatchObject({ projectId: "project.held", session: { runId: "run.held" } });
    expect(verified).toHaveProperty("resultCheck", { checked: true, epoch: 3, code: "core.result.check.after_repair", reason: "A repaired run is checked." });
  });

  it("leaves out a dropped fix: the graph is the last kept overlay's, which a dropped one built on and gave back", () => {
    const first = graph("graph.main", ["start", "drift", "end"], 2);
    const dropped = graph("graph.main", ["start", "drift", "end", "handler.dropped"], 2);
    const verified = automationStudioHeldRepairVerification({ request: request(["r.1"]), ledger: ledger({ repairId: "r.1", framePath: ROOT, graph: first }, { repairId: "r.2", framePath: ROOT, graph: dropped }), check });

    expect(verified.flow.nodes.map((node) => node.id)).toEqual(["start", "drift", "end"]);
  });

  it("takes the last kept root overlay, which carries the kept ones before it", () => {
    const second = graph("graph.main", ["start", "drift", "end", "handler.kept"], 2);
    const verified = automationStudioHeldRepairVerification({ request: request(["r.1", "r.2"]), ledger: ledger({ repairId: "r.1", framePath: ROOT, graph: graph("graph.main", ["start", "drift", "end"], 2) }, { repairId: "r.2", framePath: ROOT, graph: second }), check });

    expect(verified.flow.nodes.map((node) => node.id)).toEqual(["start", "drift", "end", "handler.kept"]);
  });

  it("keeps the starting graph when the kept fix was made in a called part's frame, or for another Flow, or none is on record", () => {
    const inChild = automationStudioHeldRepairVerification({ request: request(["r.1"]), ledger: ledger({ repairId: "r.1", framePath: CHILD, graph: graph("graph.part", ["a"]) }), check });
    const otherFlow = automationStudioHeldRepairVerification({ request: request(["r.1"]), ledger: ledger({ repairId: "r.1", framePath: ROOT, graph: graph("graph.other", ["a"]) }), check });
    const noLedger = automationStudioHeldRepairVerification({ request: request(["r.1"]), ledger: undefined, check: null });

    expect(inChild.flow).toBe(started);
    expect(otherFlow.flow).toBe(started);
    expect(noLedger.flow).toBe(started);
    expect(inChild).toHaveProperty("resultCheck.code", "core.result.check.after_repair");
    expect(noLedger).not.toHaveProperty("resultCheck");
  });
});
