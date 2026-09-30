import { describe, expect, it, vi } from "vitest";
import { flowChangeDiffMode, flowChangeDiffRows, isFlowBootstrapAdaptation, loadFlowChangeTopology, type ChangeDiffTopology } from "../index";

function bootstrap(overrides: { mode?: string; subflows?: any[]; router?: any } = {}) {
  return {
    adaptationId: "adaptation.bootstrap",
    status: "proposed",
    patch: [
      { kind: "edit_router", targetId: overrides.router?.routerId ?? "router.one", after: { routerId: "router.one", name: "Checkout Router", ruleCount: 3, fallbackKind: "fail", ...overrides.router } },
      ...(overrides.subflows ?? [{ subflowId: "subflow.pay", graphFlowId: "graph.pay", name: "Pay", role: "main", nodeCount: 4, edgeCount: 3 }]).map((after) => ({ kind: "create_subflow", targetId: after.subflowId, after }))
    ],
    metadata: { adaptationKind: "flow_bootstrap", bootstrap: { ...(overrides.mode ? { mode: overrides.mode } : {}) } }
  };
}

const current: ChangeDiffTopology = {
  router: { routerId: "router.one", ruleCount: 2 },
  subflows: [
    { subflowId: "subflow.pay", name: "Pay", graphFlowId: "graph.pay", nodeCount: 3, edgeCount: 2, nodes: [{ nodeId: "n1", label: "Open cart" }, { nodeId: "n2", label: "Old step" }, { nodeId: "n3", label: "Pay" }] },
    { subflowId: "subflow.other", name: "Other", graphFlowId: "graph.other" }
  ]
};

describe("Flow Bootstrap change diff", () => {
  it("recognises bootstrap adaptations only", () => {
    expect(isFlowBootstrapAdaptation(bootstrap())).toBe(true);
    expect(isFlowBootstrapAdaptation({ metadata: { adaptationKind: "runtime" } })).toBe(false);
    expect(isFlowBootstrapAdaptation(null)).toBe(false);
  });

  it("marks everything in a create as added, whatever exists now", () => {
    const empty: ChangeDiffTopology = { router: null, subflows: [] };
    const adaptation = bootstrap({ router: { routerId: "router.new" }, subflows: [{ subflowId: "subflow.new", name: "New", nodeCount: 2, edgeCount: 1 }] });
    expect(flowChangeDiffMode(adaptation, empty)).toBe("create");
    const rows = flowChangeDiffRows(adaptation, empty);
    expect(rows.map((row) => [row.targetKind, row.targetId, row.status])).toEqual([["router", "router.new", "added"], ["subflow", "subflow.new", "added"]]);
    expect(rows[0]!.before).toBeUndefined();
    expect(rows[1]!.after).toEqual({ name: "New", nodeCount: 2, edgeCount: 1 });
    // A declared create never compares against the Flow, even on a shared id.
    expect(flowChangeDiffRows(bootstrap({ mode: "create" }), current).every((row) => row.status === "added")).toBe(true);
    expect(flowChangeDiffRows(bootstrap({ mode: "create" }), null).every((row) => row.status === "added")).toBe(true);
  });

  it("reads matching ids as an extend and compares before with after", () => {
    const adaptation = bootstrap({ subflows: [
      { subflowId: "subflow.pay", graphFlowId: "graph.pay", name: "Pay", role: "main", nodeCount: 4, edgeCount: 3 },
      { subflowId: "subflow.refund", graphFlowId: "graph.refund", name: "Refund", role: "branch", nodeCount: 2, edgeCount: 1 },
      { subflowId: "subflow.other", graphFlowId: "graph.other", name: "Other", role: "branch", nodeCount: 1, edgeCount: 0 }
    ] });
    expect(flowChangeDiffMode(adaptation, current)).toBe("extend");
    const rows = flowChangeDiffRows(adaptation, current);
    expect(rows.map((row) => [row.targetId, row.status])).toEqual([["router.one", "changed"], ["subflow.pay", "changed"], ["subflow.refund", "added"], ["subflow.other", "unchanged"]]);
    expect(rows[0]!.before).toEqual({ ruleCount: 2 });
    expect(rows[1]!.before).toEqual({ name: "Pay", graphFlowId: "graph.pay", nodeCount: 3, edgeCount: 2 });
    expect(rows[1]!.steps).toBeUndefined();
  });

  it("honours a declared extend mode and an unchanged Router", () => {
    const adaptation = bootstrap({ mode: "extend", router: { ruleCount: 2 }, subflows: [] });
    expect(flowChangeDiffMode(adaptation, { router: null, subflows: [] })).toBe("extend");
    expect(flowChangeDiffRows(adaptation, current)[0]!.status).toBe("unchanged");
  });

  it("diffs steps by node id when the proposal carries them", () => {
    const adaptation = bootstrap({ mode: "extend", subflows: [{ subflowId: "subflow.pay", graphFlowId: "graph.pay", name: "Pay", nodeCount: 3, edgeCount: 2, steps: [{ nodeId: "n1", label: "Open cart" }, { nodeId: "n3", label: "Pay" }, { nodeId: "n4", label: "Confirm", type: "click" }, { label: "no id" }] }] });
    const row = flowChangeDiffRows(adaptation, current)[1]!;
    expect(row.status).toBe("changed");
    expect(row.steps).toEqual({
      added: [{ nodeId: "n4", label: "Confirm", type: "click" }],
      removed: [{ nodeId: "n2", label: "Old step" }],
      kept: [{ nodeId: "n1", label: "Open cart" }, { nodeId: "n3", label: "Pay" }]
    });
    const same = bootstrap({ mode: "extend", subflows: [{ subflowId: "subflow.pay", graphFlowId: "graph.pay", name: "Pay", nodeCount: 3, edgeCount: 2, steps: current.subflows[0]!.nodes }] });
    expect(flowChangeDiffRows(same, current)[1]!.status).toBe("unchanged");
    const relabelled = bootstrap({ mode: "extend", subflows: [{ subflowId: "subflow.pay", graphFlowId: "graph.pay", name: "Pay", nodeCount: 3, edgeCount: 2, steps: [{ nodeId: "n1", label: "Open basket" }, { nodeId: "n2", label: "Old step" }, { nodeId: "n3", label: "Pay" }] }] });
    expect(flowChangeDiffRows(relabelled, current)[1]!.status).toBe("changed");
    const added = bootstrap({ mode: "extend", subflows: [{ subflowId: "subflow.new", name: "New", steps: [{ nodeId: "a" }] }] });
    expect(flowChangeDiffRows(added, current)[1]!.steps).toEqual({ added: [{ nodeId: "a" }], removed: [], kept: [] });
  });

  it("does not invent a step diff or a status when current data is missing", () => {
    const withSteps = bootstrap({ mode: "extend", subflows: [{ subflowId: "subflow.other", name: "Other", nodeCount: 1, steps: [{ nodeId: "x" }] }] });
    // The current Subflow's graph was not read: no step diff, never "all removed".
    expect(flowChangeDiffRows(withSteps, current)[1]!.steps).toBeUndefined();
    // The topology could not be read at all.
    expect(flowChangeDiffMode(bootstrap(), null)).toBeUndefined();
    expect(flowChangeDiffRows(bootstrap(), null).map((row) => row.status)).toEqual(["unknown", "unknown"]);
    expect(flowChangeDiffRows(withSteps, null).map((row) => row.status)).toEqual(["unknown", "unknown"]);
    expect(flowChangeDiffRows({ patch: "nope" }, current)).toEqual([]);
  });

  it("loads the current topology through bounded endpoints and pages each graph", async () => {
    const post = vi.fn(async (endpoint: string, payload: any) => {
      if (endpoint === "get-flow-router-summary") return { ok: true, payload: { router: { routerId: "router.one", ruleCount: 2, name: "Flow Router" } } };
      if (endpoint === "list-flow-subflows") return { ok: true, payload: { subflows: [{ subflowId: "subflow.pay", name: "Pay", graphFlowId: "graph.pay" }, { subflowId: "subflow.skip", name: "Skip", graphFlowId: "graph.skip" }, { subflowId: "subflow.bad", name: "Bad", graphFlowId: "graph.bad" }] } };
      if (endpoint === "get-graph-viewport" && payload.flowId === "graph.bad") return { ok: false, error: "graph unavailable" };
      if (endpoint === "get-graph-viewport" && !payload.cursor) return { ok: true, payload: { page: { nodes: [{ nodeId: "n1", label: "Open", definitionId: "open" }], edges: [], boundaryEdges: [{ edgeId: "e1" }], hasMore: true, nextCursor: "c1" } } };
      if (endpoint === "get-graph-viewport") return { ok: true, payload: { page: { nodes: [{ nodeId: "n2", label: "" }], edges: [], boundaryEdges: [{ edgeId: "e1" }], hasMore: false, nextCursor: null } } };
      throw new Error("unexpected " + endpoint);
    });
    const result = await loadFlowChangeTopology({ post } as any, { projectId: "p", flowId: "f", subflowIds: ["subflow.pay", "subflow.bad"] });
    expect(result).toEqual({ ok: true, payload: { topology: {
      router: { routerId: "router.one", ruleCount: 2 },
      subflows: [
        { subflowId: "subflow.pay", name: "Pay", graphFlowId: "graph.pay", nodes: [{ nodeId: "n1", label: "Open", type: "open" }, { nodeId: "n2" }], nodeCount: 2, edgeCount: 1 },
        { subflowId: "subflow.skip", name: "Skip", graphFlowId: "graph.skip" },
        { subflowId: "subflow.bad", name: "Bad", graphFlowId: "graph.bad" }
      ]
    } } });
    const endpoints = post.mock.calls.map(([endpoint]) => endpoint);
    expect(endpoints).not.toContain("get-flow");
    expect(endpoints).not.toContain("get-flow-router");
    expect(post.mock.calls.filter(([endpoint, payload]) => endpoint === "get-graph-viewport" && (payload as any).flowId === "graph.skip")).toHaveLength(0);
  });

  it("fails the topology load when the Router or Subflows cannot be read", async () => {
    const post = vi.fn(async (endpoint: string) => endpoint === "list-flow-subflows" ? { ok: false, error: "denied" } : { ok: true, payload: { router: null } });
    await expect(loadFlowChangeTopology({ post } as any, { projectId: "p", flowId: "f" })).resolves.toEqual({ ok: false, error: "denied" });
  });
});
