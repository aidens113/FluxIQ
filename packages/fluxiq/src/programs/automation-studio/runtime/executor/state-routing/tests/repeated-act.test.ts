import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../../../model/index.ts";
import type { AutomationStudioGraphExecutionOptions, AutomationStudioNodeAttemptTrace } from "../../contracts.ts";
import { automationStudioRepeatedLastingAct } from "../index.ts";

type Host = NonNullable<AutomationStudioGraphExecutionOptions["hostRuntime"]>;

const node = (id: string, metadata: NonNullable<AutomationStudioFlowNode["metadata"]> = {}): AutomationStudioFlowNode => ({ id, definitionId: "web.unregistered.press", metadata });
const lasting = { declaredConsequences: ["create_new"] };
const edge = (from: string, to: string) => ({ id: `${from}.${to}`, sourceNodeId: from, sourcePortId: "success", targetNodeId: to });
const flowOf = (nodes: AutomationStudioFlowNode[]): AutomationStudioFlowDocument => ({
  schemaVersion: "0.1", flowId: "flow.repeat", ownerKind: "routine", ownerId: "routine.test", name: "Repeat", createdAt: 1, updatedAt: 1,
  nodes, edges: nodes.slice(1).map((next, index) => edge(nodes[index]!.id, next.id))
});
const ran = (nodeId: string, overrides: Partial<AutomationStudioNodeAttemptTrace> = {}): AutomationStudioNodeAttemptTrace => ({ attemptId: `${nodeId}.attempt.1`, nodeId, definitionId: "web.unregistered.press", startedAt: 1, status: "succeeded", route: "success", inputs: {}, outputs: {}, effects: [], ...overrides });
const host = (holds?: boolean): Host => ({ capabilities: [], ...(holds === undefined ? {} : { routeEffectHolds: () => holds }) });

function repeated(flow: AutomationStudioFlowDocument, toNodeId: string, attempts: AutomationStudioNodeAttemptTrace[], hostRuntime: Host = host()) {
  return automationStudioRepeatedLastingAct({ flow, fromNodeId: "d", toNodeId, attempts, hostRuntime, observed: { page: "now" } });
}

describe("a completed lasting act a backward route would repeat", () => {
  // a -> b -> c -> d; d cannot run and the page matches a.
  it("names a completed lasting act on the walk back, saying the page cannot show it did not land", () => {
    const flow = flowOf([node("a"), node("b", lasting), node("c"), node("d")]);
    expect(repeated(flow, "a", [ran("a"), ran("b"), ran("c")])).toEqual({ nodeId: "b", effect: "unknown" });
  });

  it("says the effect is on the page when the host finds the act's recorded effect there, and refuses all the same", () => {
    const flow = flowOf([node("a"), node("b", { ...lasting, routeSignatures: { effect: { added: "item" } } }), node("c"), node("d")]);
    expect(repeated(flow, "a", [ran("b")], host(true))).toEqual({ nodeId: "b", effect: "on_page" });
    expect(repeated(flow, "a", [ran("b")], host(false))).toEqual({ nodeId: "b", effect: "unknown" });
  });

  it("counts the target itself, and not the failing step or a step off the walk", () => {
    const flow = flowOf([node("a", lasting), node("b"), node("c"), node("d", lasting)]);
    expect(repeated(flow, "b", [ran("a"), ran("d")])).toBeUndefined();
    expect(repeated(flow, "a", [ran("a")])).toEqual({ nodeId: "a", effect: "unknown" });
  });

  it("finds none when the act did not complete, was skipped, or is safe to repeat", () => {
    const flow = flowOf([node("a"), node("b", lasting), node("c", { ...lasting, idempotent: true }), node("d")]);
    expect(repeated(flow, "a", [ran("b", { status: "failed" }), ran("c")])).toBeUndefined();
    expect(repeated(flow, "a", [ran("b", { skipped: { reason: "target_absent", code: "web.target.not_found" } })])).toBeUndefined();
  });
});
