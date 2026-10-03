// A partial run: `stopAfterNodeId` ends a run once that node has run, without
// following any way out of it (t249). The recovery stage's partial-run tool is
// the caller this is for; a build or repair still needs one whole run from the
// Flow's start, judged, before anything it changed is kept.
//
// It composes with state routing (t243): a page that routes the run past the
// stop node stops it there too, a route back to an earlier step is followed,
// and a route onto the stop node runs it.

import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../../model/index.ts";
import { runAutomationStudioGraph, type AutomationStudioGraphExecutionOptions, type AutomationStudioGraphExecutionTrace } from "../index.ts";

type Host = NonNullable<AutomationStudioGraphExecutionOptions["hostRuntime"]>;
type Dispatcher = NonNullable<AutomationStudioGraphExecutionOptions["effectDispatcher"]>;
type Page = { current: string };

const signatures = (before?: string, after?: string) => ({ routeSignatures: { ...(before ? { before: { page: before } } : {}), ...(after ? { after: { page: after } } : {}) } });

function step(id: string, metadata?: AutomationStudioFlowNode["metadata"]): AutomationStudioFlowNode {
  return {
    id,
    definitionId: "builtin.policy.action",
    label: `Step ${id}`,
    parameterValues: { outputId: "activate-element", parameters: { elementId: id } },
    ...(metadata ? { metadata } : {})
  };
}

function line(nodes: AutomationStudioFlowNode[], extraEdges: AutomationStudioFlowDocument["edges"] = []): AutomationStudioFlowDocument {
  const edges = nodes.slice(1).map((node, index) => ({ id: `${nodes[index]!.id}.success`, sourceNodeId: nodes[index]!.id, sourcePortId: "success", targetNodeId: node.id, targetPortId: "in" }));
  return { schemaVersion: "0.1", flowId: "flow.stop-after", ownerKind: "routine", ownerId: "routine.test", name: "Stop after", createdAt: 1, updatedAt: 1, nodes, edges: [...edges, ...extraEdges] };
}

function host(page: Page): Host {
  return {
    capabilities: [],
    observeRouteState: () => ({ page: page.current }),
    signRouteState: (state) => ({ page: String(state.page) }),
    compareRouteSignatures: (recorded, observed) => (recorded.page === observed.page ? { matches: true, closeness: 1 } : { matches: false, closeness: 0 })
  };
}

/** Presses the element a node names; `absent` says when its target is missing, `leads` where a landed press takes the page. */
function dispatcher(page: Page, calls: string[], absent: (id: string, call: number) => boolean = () => false, leads: Record<string, string> = {}): Dispatcher {
  return (effect) => {
    const id = /"elementId":"([^"]+)"/u.exec(JSON.stringify(effect.payload ?? null))?.[1] ?? "?";
    calls.push(id);
    if (absent(id, calls.filter((call) => call === id).length)) {
      return { status: "failed", route: "failed", message: "No target resolved.", failure: { category: "target_not_found", code: "web.target.not_found", retryable: false, stage: "target_resolution" } };
    }
    if (leads[id]) page.current = leads[id]!;
    return { status: "success", route: "success", outputs: { ok: true } };
  };
}

async function run(flow: AutomationStudioFlowDocument, options: AutomationStudioGraphExecutionOptions): Promise<AutomationStudioGraphExecutionTrace> {
  return await runAutomationStudioGraph(flow, { delay: async () => undefined, ...options });
}

describe("a run asked to stop after a node", () => {
  it("ends succeeded once that node has run, and never follows its outgoing edge", async () => {
    const calls: string[] = [];
    const page: Page = { current: "p1" };
    const trace = await run(line([step("s1"), step("s2"), step("s3")]), { stopAfterNodeId: "s2", effectDispatcher: dispatcher(page, calls) });

    expect(trace).toMatchObject({ status: "succeeded", stopReason: "stopped_at_node", currentNodeId: "s2" });
    expect(trace.attempts.map((attempt) => attempt.nodeId)).toEqual(["s1", "s2"]);
    expect(trace.attempts[1]).toMatchObject({ status: "succeeded", route: "success" });
    expect(calls).toEqual(["s1", "s2"]);
    expect(trace.message).toContain("s2");
  });

  it("starts where it is told and stops where it is told, so a part of the Flow can be tested on its own", async () => {
    const calls: string[] = [];
    const trace = await run(line([step("s1"), step("s2"), step("s3"), step("s4")]), { startNodeId: "s2", stopAfterNodeId: "s3", effectDispatcher: dispatcher({ current: "p" }, calls) });

    expect(trace).toMatchObject({ status: "succeeded", stopReason: "stopped_at_node" });
    expect(calls).toEqual(["s2", "s3"]);
  });

  it("stops at a node with no outgoing edge rather than failing for the edge it lacks", async () => {
    const calls: string[] = [];
    // s2 has no edge out and s3 was never visited: a whole run would fail here.
    // (s3 has no edge in either, so the run is told where to start.)
    const flow = line([step("s1"), step("s2")]);
    flow.nodes.push(step("s3"));
    const whole = await run(flow, { startNodeId: "s1", effectDispatcher: dispatcher({ current: "p" }, []) });
    expect(whole.status).toBe("failed");
    const trace = await run(flow, { startNodeId: "s1", stopAfterNodeId: "s2", effectDispatcher: dispatcher({ current: "p" }, calls) });

    expect(trace).toMatchObject({ status: "succeeded", stopReason: "stopped_at_node", currentNodeId: "s2" });
    expect(calls).toEqual(["s1", "s2"]);
  });

  it("records a failed stop node and does not take its failed route", async () => {
    const calls: string[] = [];
    const flow = line([step("s1"), step("s2"), step("s3")], [{ id: "s2.failed", sourceNodeId: "s2", sourcePortId: "failed", targetNodeId: "s3", targetPortId: "in" }]);
    const trace = await run(flow, { stopAfterNodeId: "s2", effectDispatcher: dispatcher({ current: "p" }, calls, (id) => id === "s2") });

    expect(trace).toMatchObject({ status: "succeeded", stopReason: "stopped_at_node", currentNodeId: "s2" });
    expect(trace.attempts.at(-1)).toMatchObject({ nodeId: "s2", status: "failed" });
    expect(calls).not.toContain("s3");
  });

  it("runs to the end as before when no stop node is given", async () => {
    const calls: string[] = [];
    const trace = await run(line([step("s1"), step("s2"), step("s3")]), { effectDispatcher: dispatcher({ current: "p" }, calls) });

    expect(trace.status).toBe("succeeded");
    expect(trace).not.toHaveProperty("stopReason");
    expect(calls).toEqual(["s1", "s2", "s3"]);
  });
});

describe("a partial run and state routing", () => {
  it("stops when the page routes the run past the stop node, and runs nothing beyond it", async () => {
    const calls: string[] = [];
    const page: Page = { current: "p1" };
    // s2 cannot run and the page is already at s4's starting page: the route
    // would skip s3, the stop node, and run s4.
    const flow = line([step("s1", signatures("p1", "p2")), step("s2", signatures("p2", "p3")), step("s3", signatures("p3", "p4")), step("s4", signatures("p4", "p5"))]);
    const trace = await run(flow, { stopAfterNodeId: "s3", hostRuntime: host(page), effectDispatcher: dispatcher(page, calls, (id) => id === "s2", { s1: "p4" }) });

    expect(trace).toMatchObject({ status: "succeeded", stopReason: "stopped_at_node", currentNodeId: "s2" });
    expect(trace.attempts.map((attempt) => attempt.nodeId)).toEqual(["s1", "s2"]);
    expect(trace.attempts[1]).toMatchObject({ stateRouting: { outcome: "routed", toNodeId: "s4", direction: "forward" } });
    expect(calls).not.toContain("s4");
    expect(trace.message).toContain("s4");
  });

  it("runs the stop node when the page routes the run onto it, then stops", async () => {
    const calls: string[] = [];
    const page: Page = { current: "p1" };
    const flow = line([step("s1", signatures("p1", "p2")), step("s2", signatures("p2", "p3")), step("s3", signatures("p3", "p4")), step("s4", signatures("p4", "p5"))]);
    const trace = await run(flow, { stopAfterNodeId: "s3", hostRuntime: host(page), effectDispatcher: dispatcher(page, calls, (id) => id === "s2", { s1: "p3", s3: "p4" }) });

    expect(trace).toMatchObject({ status: "succeeded", stopReason: "stopped_at_node", currentNodeId: "s3" });
    expect(calls).toEqual(["s1", "s2", "s3"]);
  });

  it("follows a route back to an earlier step from the stop node, and stops when the stop node runs again", async () => {
    const calls: string[] = [];
    const page: Page = { current: "p1" };
    const flow = line([step("s1", signatures("p1", "p2")), step("s2", signatures("p2", "p3")), step("s3", signatures("p3", "p4"))]);
    const trace = await run(flow, { startNodeId: "s2", stopAfterNodeId: "s2", hostRuntime: host(page), effectDispatcher: dispatcher(page, calls, (id, call) => id === "s2" && call === 1, { s1: "p2", s2: "p3" }) });

    expect(trace).toMatchObject({ status: "succeeded", stopReason: "stopped_at_node", currentNodeId: "s2" });
    expect(trace.attempts.map((attempt) => attempt.nodeId)).toEqual(["s2", "s1", "s2"]);
    expect(trace.attempts[0]).toMatchObject({ stateRouting: { outcome: "routed", toNodeId: "s1", direction: "backward" } });
    expect(calls).not.toContain("s3");
  });

  it("stops at a stop node the page shows is already done, rather than going on along its success edge", async () => {
    const calls: string[] = [];
    const page: Page = { current: "p1" };
    // s2 cannot run, but the page already shows its effect: state routing
    // would go on along s2's own success edge, which is leaving the stop node.
    const flow = line([step("s1", signatures("p1", "p2")), { ...step("s2"), metadata: { routeSignatures: { effect: { page: "p3" } } } }, step("s3", signatures("p3", "p4"))]);
    const effectHost: Host = { ...host(page), routeEffectHolds: (effect, observed) => effect.page === observed.page };
    const trace = await run(flow, { stopAfterNodeId: "s2", hostRuntime: effectHost, effectDispatcher: dispatcher(page, calls, (id) => id === "s2", { s1: "p3" }) });

    expect(trace).toMatchObject({ status: "succeeded", stopReason: "stopped_at_node", currentNodeId: "s2" });
    expect(calls).not.toContain("s3");
  });
});
