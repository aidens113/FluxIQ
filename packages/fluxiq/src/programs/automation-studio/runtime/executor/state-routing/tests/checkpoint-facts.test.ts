// The fact gate on a state route's target (C6, "Safe state routing"; C2
// checkpoints): with checkpoints declared only a checkpoint whose `when` all
// answers true qualifies; without them a match whose readyState is written as
// fact conditions must have them all answer true. One batched host call per
// decision, none when nothing is to be asked.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../../../model/index.ts";
import type { AutomationStudioFactCondition } from "../../lifecycle/index.ts";
import type { AutomationStudioGraphExecutionOptions } from "../../contracts.ts";
import { automationStudioNotShownAttempt, automationStudioStateRouteFactGate, automationStudioStateRouteGuard, decideAutomationStudioStateRoute } from "../index.ts";

type Host = NonNullable<AutomationStudioGraphExecutionOptions["hostRuntime"]>;
type Truth = "true" | "false" | "unknown";
type Metadata = NonNullable<AutomationStudioFlowNode["metadata"]>;

const fact = (name: string): AutomationStudioFactCondition => ({ fact: name, op: "exists" });

/** A step that expected page `before`, matched at `closeness`, with extra metadata. */
const step = (id: string, before: string | undefined, metadata: Metadata = {}, closeness = 1): AutomationStudioFlowNode => ({
  id,
  definitionId: "web.unregistered.press",
  metadata: { ...metadata, ...(before ? { routeSignatures: { before: { page: before, closeness } } } : {}) }
});
const checkpoint = (id: string, when?: AutomationStudioFactCondition[]): Metadata => ({ "fluxiq.checkpoint": { id, ...(when ? { when } : {}) } });
const line = (nodes: AutomationStudioFlowNode[]): AutomationStudioFlowDocument => ({
  schemaVersion: "0.1", flowId: "flow.checkpoints", ownerKind: "routine", ownerId: "routine.test", name: "Checkpoints", createdAt: 1, updatedAt: 1,
  nodes, edges: nodes.slice(1).map((next, index) => ({ id: `${nodes[index]!.id}.success.${next.id}`, sourceNodeId: nodes[index]!.id, sourcePortId: "success", targetNodeId: next.id }))
});

/** A host on `page` whose facts answer from `truths` (missing: unknown), counting its fact calls; `facts: false` gives it no fact evaluation. */
function host(page: string, truths: Record<string, Truth> = {}, options: { facts?: boolean } = {}): { host: Host; calls: AutomationStudioFactCondition[][] } {
  const calls: AutomationStudioFactCondition[][] = [];
  const base: Host = {
    capabilities: [],
    observeRouteState: () => ({ page }),
    signRouteState: (state) => ({ page: String(state.page) }),
    compareRouteSignatures: (recorded, observed) => (recorded.page === observed.page ? { matches: true, closeness: Number(recorded.closeness ?? 1) } : { matches: false, closeness: 0 })
  };
  if (options.facts === false) return { host: base, calls };
  return {
    calls,
    host: {
      ...base,
      factEvaluator: (conditions) => {
        calls.push([...conditions]);
        return conditions.map((condition) => ({ result: truths[condition.fact] ?? "unknown", capturedAt: 1 }));
      }
    }
  };
}

async function decide(flow: AutomationStudioFlowDocument, failingId: string, hostRuntime: Host) {
  const failing = flow.nodes.find((candidate) => candidate.id === failingId)!;
  return await decideAutomationStudioStateRoute({ flow, node: failing, attempt: automationStudioNotShownAttempt(failing, `${failingId}.attempt.9`, 1), attempts: [], options: { hostRuntime }, guard: automationStudioStateRouteGuard() });
}

describe("with recovery checkpoints declared", () => {
  // a -> b -> c -> d; b cannot run. c matches closest, but only d is a checkpoint.
  const flow = line([step("a", "p1"), step("b", "p2"), step("c", "p3", {}, 1), step("d", "p3", checkpoint("cp.d", [fact("cart.open")]), 0.6)]);

  it("refuses a match that is not a checkpoint and takes a checkpoint whose when holds", async () => {
    const page = host("p3", { "cart.open": "true" });
    const decision = await decide(flow, "b", page.host);
    expect(decision).toMatchObject({
      kind: "routed",
      node: { id: "d" },
      direction: "forward",
      record: { outcome: "routed", matched: 1, toNodeId: "d", refused: [{ toNodeId: "c", guard: "not_checkpoint", nodeId: "c" }] }
    });
    expect(page.calls).toEqual([[fact("cart.open")]]);
  });

  it("refuses a checkpoint whose when answers unknown, and with nothing left the decision is none", async () => {
    const decision = await decide(flow, "b", host("p3").host);
    expect(decision).toMatchObject({
      kind: "none",
      record: { outcome: "no_match", matched: 0, refused: [{ toNodeId: "c", guard: "not_checkpoint" }, { toNodeId: "d", guard: "checkpoint_when_not_true", nodeId: "d" }] }
    });
    expect(decision.kind === "none" ? decision.record.reason : "").toMatch(/checkpoint node d could not all be shown to hold/u);
  });

  it("refuses a checkpoint whose when answers false", async () => {
    const decision = await decide(flow, "b", host("p3", { "cart.open": "false" }).host);
    expect(decision).toMatchObject({ kind: "none", record: { refused: [{ guard: "not_checkpoint" }, { toNodeId: "d", guard: "checkpoint_when_not_true" }] } });
    expect(decision.kind === "none" ? decision.record.reason : "").toMatch(/did not all hold/u);
  });

  it("qualifies nothing when the host has no fact evaluation", async () => {
    expect(await decide(flow, "b", host("p3", {}, { facts: false }).host)).toMatchObject({ kind: "none", record: { refused: [{ guard: "not_checkpoint" }, { guard: "checkpoint_when_not_true" }] } });
  });

  it("refuses a checkpoint whose declaration could not be read rather than loosening it", async () => {
    const broken = line([step("a", "p1"), step("b", "p2"), step("d", "p3", { "fluxiq.checkpoint": { id: "cp.d", when: [fact("cart.open"), { op: "exists" }] } })]);
    expect(await decide(broken, "b", host("p3", { "cart.open": "true" }).host)).toMatchObject({ kind: "none", record: { refused: [{ toNodeId: "d", guard: "checkpoint_when_not_true" }] } });
  });

  it("asks every matched checkpoint's conditions in one batched call", async () => {
    const two = line([step("a", "p3", checkpoint("cp.a", [fact("home")])), step("b", "p2"), step("c", "p3", checkpoint("cp.c", [fact("list"), fact("signed.in")]))]);
    const page = host("p3", { list: "true", "signed.in": "true", home: "false" });
    expect(await decide(two, "b", page.host)).toMatchObject({ kind: "routed", node: { id: "c" }, direction: "forward" });
    expect(page.calls).toHaveLength(1);
    expect(page.calls[0]).toHaveLength(3);
  });
});

describe("without checkpoints, a readyState written as fact conditions", () => {
  // a -> b -> c -> d; b cannot run. c matches closest, and its ready state is a fact.
  const gated = line([step("a", "p1"), step("b", "p2"), step("c", "p3", { readyState: { conditions: [fact("results.shown")] } }), step("d", "p3", {}, 0.6)]);

  it("refuses a close signature match whose facts are false, and the next ranked match is taken", async () => {
    const page = host("p3", { "results.shown": "false" });
    expect(await decide(gated, "b", page.host)).toMatchObject({
      kind: "routed",
      node: { id: "d" },
      record: { outcome: "routed", matched: 1, toNodeId: "d", refused: [{ toNodeId: "c", guard: "ready_state_not_true", nodeId: "c" }] }
    });
    expect(page.calls).toHaveLength(1);
  });

  it("takes the match when its facts hold", async () => {
    expect(await decide(gated, "b", host("p3", { "results.shown": "true" }).host)).toMatchObject({ kind: "routed", node: { id: "c" } });
  });

  it("judges a ready state in the readiness gate's expectation form exactly as before", async () => {
    const expectation = line([step("a", "p1"), step("b", "p2"), step("c", "p3", { readyState: { kind: "text", text: "Results" } })]);
    const page = host("p3");
    expect(await decide(expectation, "b", page.host)).toMatchObject({ kind: "routed", node: { id: "c" } });
    expect(page.calls).toHaveLength(0);
  });
});

describe("a Flow with neither checkpoints nor fact ready states", () => {
  it("makes no fact call", async () => {
    const plain = line([step("a", "p1"), step("b", "p2"), step("c", "p3")]);
    const page = host("p3");
    expect(await decide(plain, "b", page.host)).toMatchObject({ kind: "routed", node: { id: "c" } });
    expect(page.calls).toHaveLength(0);
  });

  it("the gate itself asks nothing and refuses nothing", async () => {
    const plain = line([step("a", "p1"), step("b", "p2")]);
    const page = host("p1");
    const gate = await automationStudioStateRouteFactGate({ flow: plain, nodeIds: ["a", "b"], hostRuntime: page.host, context: {} });
    expect(gate).toEqual({ refused: new Map(), calls: 0 });
    expect(page.calls).toHaveLength(0);
  });
});
