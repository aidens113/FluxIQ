// A state route a safety guard refuses (C6, "Safe state routing") leaves the
// run exactly where a step with no match leaves it: the attempt keeps its
// routing record, now naming the guard, and the recovery ladder runs.

import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../../model/index.ts";
import { runAutomationStudioGraph, type AutomationStudioGraphExecutionOptions } from "../index.ts";

type Host = NonNullable<AutomationStudioGraphExecutionOptions["hostRuntime"]>;
type Dispatcher = NonNullable<AutomationStudioGraphExecutionOptions["effectDispatcher"]>;
type Page = { current: string };

const signatures = (before: string, after?: string) => ({ routeSignatures: { before: { page: before }, ...(after ? { after: { page: after } } : {}) } });

function step(id: string, metadata: NonNullable<AutomationStudioFlowNode["metadata"]>, parameters: Record<string, unknown> = {}): AutomationStudioFlowNode {
  return {
    id,
    definitionId: "builtin.policy.action",
    parameterValues: { outputId: "activate-element", parameters: { elementId: id }, ...parameters } as NonNullable<AutomationStudioFlowNode["parameterValues"]>,
    metadata
  };
}

function line(nodes: AutomationStudioFlowNode[]): AutomationStudioFlowDocument {
  const edges = nodes.slice(1).map((node, index) => ({ id: `${nodes[index]!.id}.success`, sourceNodeId: nodes[index]!.id, sourcePortId: "success", targetNodeId: node.id, targetPortId: "in" }));
  return { schemaVersion: "0.1", flowId: "flow.safe-routing", ownerKind: "routine", ownerId: "routine.test", name: "Safe routing", createdAt: 1, updatedAt: 1, nodes, edges };
}

function host(page: Page): Host {
  return {
    capabilities: [],
    observeRouteState: () => ({ page: page.current }),
    signRouteState: (state) => ({ page: String(state.page) }),
    compareRouteSignatures: (recorded, observed) => (recorded.page === observed.page ? { matches: true, closeness: 1 } : { matches: false, closeness: 0 })
  };
}

/** Presses the element a node names; `absent` names the one whose target is never on the page, and a press that lands moves the page to `leads[id]`. */
function dispatcher(page: Page, calls: string[], absent: string, leads: Record<string, string>): Dispatcher {
  return (effect) => {
    const id = /"elementId":"([^"]+)"/u.exec(JSON.stringify(effect.payload ?? null))?.[1] ?? "?";
    calls.push(id);
    if (id === absent) return { status: "failed", route: "failed", message: "No target resolved.", failure: { category: "target_not_found", code: "web.target.not_found", retryable: true, stage: "target_resolution" } };
    if (leads[id]) page.current = leads[id]!;
    return { status: "success", route: "success", outputs: { ok: true } };
  };
}

describe("a state route a safety guard refuses", () => {
  it("does not go on past a step whose value the next step reads, and runs the ladder", async () => {
    const page: Page = { current: "p1" };
    const calls: string[] = [];
    // s1 lands the page where s3 starts, but s3 reads what s2 would have set.
    const flow = line([step("s1", signatures("p1", "p2")), step("s2", signatures("p2", "p3")), step("s3", signatures("p3", "p4"), { query: { $state: { path: "s2.picked" } } })]);
    const trace = await runAutomationStudioGraph(flow, { delay: async () => undefined, hostRuntime: host(page), effectDispatcher: dispatcher(page, calls, "s2", { s1: "p3", s3: "p4" }) });

    expect(trace.status).toBe("failed");
    expect(calls).not.toContain("s3");
    const s2 = trace.attempts.filter((attempt) => attempt.nodeId === "s2");
    expect(s2.length).toBeGreaterThan(0);
    for (const attempt of s2) {
      expect(attempt).toMatchObject({ status: "failed", stateRouting: { outcome: "no_match", matched: 0, refused: [{ toNodeId: "s3", guard: "unbound_value", nodeId: "s2" }] } });
    }
    expect(s2[0]!.recoveryDecision).toBeDefined();
  });

  it("does not go back across a lasting act that already ran, and runs the ladder", async () => {
    const page: Page = { current: "p1" };
    const calls: string[] = [];
    // s1 adds something that lasts; the page then shows s1's starting page again, not its after-state.
    const flow = line([step("s1", { ...signatures("p1", "p2"), declaredConsequences: ["create_new"] }), step("s2", signatures("p2", "p3")), step("s3", signatures("p3", "p4"))]);
    const trace = await runAutomationStudioGraph(flow, { delay: async () => undefined, hostRuntime: host(page), effectDispatcher: dispatcher(page, calls, "s2", { s1: "p1" }) });

    // The ladder retries s2 and then, as before, carries on past a step nothing reads (s3 runs); s1 is never repeated.
    expect(calls).toEqual(["s1", "s2", "s2", "s2", "s2", "s3"]);
    expect(calls.filter((call) => call === "s1")).toHaveLength(1);
    const s2 = trace.attempts.filter((attempt) => attempt.nodeId === "s2");
    expect(s2.length).toBeGreaterThan(0);
    for (const attempt of s2) {
      expect(attempt).toMatchObject({ status: "failed", stateRouting: { outcome: "no_match", matched: 0, refused: [{ toNodeId: "s1", guard: "repeats_lasting_act", nodeId: "s1" }] } });
    }
    expect(s2[0]!.recoveryDecision).toBeDefined();
  });
});
