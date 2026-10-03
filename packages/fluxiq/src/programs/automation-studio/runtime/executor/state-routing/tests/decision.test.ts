import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../../../model/index.ts";
import type { AutomationStudioGraphExecutionOptions, AutomationStudioNodeAttemptTrace } from "../../contracts.ts";
import { automationStudioNotShownAttempt, automationStudioStateRouteGuard, decideAutomationStudioStateRoute } from "../index.ts";

type Host = NonNullable<AutomationStudioGraphExecutionOptions["hostRuntime"]>;

const node = (id: string, before?: string, after?: string, metadata: Record<string, unknown> = {}): AutomationStudioFlowNode => ({
  id,
  definitionId: "builtin.policy.action",
  metadata: { ...metadata, ...(before || after ? { routeSignatures: { ...(before ? { before: { page: before } } : {}), ...(after ? { after: { page: after } } : {}) } } : {}) } as never
});
const edge = (from: string, to: string, port = "success") => ({ id: `${from}.${port}.${to}`, sourceNodeId: from, sourcePortId: port, targetNodeId: to });
const flowOf = (nodes: AutomationStudioFlowNode[], edges: AutomationStudioFlowDocument["edges"]): AutomationStudioFlowDocument => ({
  schemaVersion: "0.1", flowId: "flow.decide", ownerKind: "routine", ownerId: "routine.test", name: "Decide", createdAt: 1, updatedAt: 1, nodes, edges
});
const acted = (nodeId: string): AutomationStudioNodeAttemptTrace => ({ attemptId: `${nodeId}.attempt.1`, nodeId, definitionId: "builtin.policy.action", startedAt: 1, status: "succeeded", route: "success", inputs: {}, outputs: {}, effects: [] });

function host(page: string, calls: { observe: number; projectId?: string; flowId?: string }, extra: Partial<Host> = {}): Host {
  return {
    capabilities: [],
    observeRouteState: (input) => {
      calls.observe += 1;
      calls.projectId = input.projectId;
      calls.flowId = input.flowId;
      return { page };
    },
    signRouteState: (state) => ({ page: String(state.page) }),
    compareRouteSignatures: (recorded, observed) => (recorded.page === observed.page ? { matches: true, closeness: 1 } : { matches: false, closeness: 0 }),
    ...extra
  };
}

async function decide(flow: AutomationStudioFlowDocument, failingId: string, hostRuntime: Host, attempts: AutomationStudioNodeAttemptTrace[] = []) {
  const failing = flow.nodes.find((candidate) => candidate.id === failingId)!;
  return await decideAutomationStudioStateRoute({ flow, node: failing, attempt: automationStudioNotShownAttempt(failing, `${failingId}.attempt.9`, 1), attempts, options: { hostRuntime }, guard: automationStudioStateRouteGuard() });
}

describe("the state-routing decision", () => {
  it("takes the Flow's declared way on past a sometimes-present step, observing nothing", async () => {
    const calls = { observe: 0 };
    const flow = flowOf([node("a", "p1"), node("pop", "p2", undefined, { sometimesPresent: true }), node("b", "p2")], [edge("a", "pop"), edge("pop", "b")]);
    const decision = await decide(flow, "pop", host("p2", calls));
    expect(decision).toMatchObject({ kind: "declared", edge: { targetNodeId: "b" } });
    expect(calls.observe).toBe(0);
  });

  it("observes nothing when no other node recorded a pre-state", async () => {
    const calls = { observe: 0 };
    const flow = flowOf([node("a"), node("b", "p2"), node("c")], [edge("a", "b"), edge("b", "c")]);
    const decision = await decide(flow, "b", host("p2", calls));
    expect(decision).toEqual({ kind: "none", record: { outcome: "no_pre_states", candidates: 0, matched: 0 } });
    expect(calls.observe).toBe(0);
  });

  it("never offers the failing node itself, whose target is demonstrably missing", async () => {
    const calls = { observe: 0 };
    const flow = flowOf([node("a", "p1"), node("b", "p2"), node("c", "p3")], [edge("a", "b"), edge("b", "c")]);
    const decision = await decide(flow, "b", host("p2", calls));
    expect(decision).toMatchObject({ kind: "none", record: { outcome: "no_match", candidates: 2, matched: 0 } });
  });

  it("reads the page through the host with the Flow's own ids and routes to the match", async () => {
    const calls: { observe: number; projectId?: string; flowId?: string } = { observe: 0 };
    const flow = flowOf([node("a", "p1"), node("b", "p2"), node("c", "p3")], [edge("a", "b"), edge("b", "c")]);
    const decision = await decide(flow, "b", host("p3", calls));
    expect(decision).toMatchObject({ kind: "routed", node: { id: "c" }, direction: "forward", closeness: 1, record: { outcome: "routed", candidates: 2, matched: 1, toNodeId: "c", direction: "forward", closeness: 1 } });
    expect(calls).toMatchObject({ observe: 1, flowId: "flow.decide", projectId: "routine.test" });
  });

  it("is unobserved when the host cannot observe or cannot sign", async () => {
    const flow = flowOf([node("a", "p1"), node("b", "p2")], [edge("a", "b")]);
    const blind: Host = { capabilities: [] };
    expect(await decide(flow, "b", blind)).toMatchObject({ kind: "none", record: { outcome: "unobserved", candidates: 1, matched: 0 } });
    const unsigned = host("p1", { observe: 0 });
    delete unsigned.signRouteState;
    expect(await decide(flow, "b", unsigned)).toMatchObject({ kind: "none", record: { outcome: "unobserved", candidates: 1, matched: 0 } });
  });

  it("excludes an acted node whose after-state still holds, or that recorded none, and keeps one whose effect is gone", async () => {
    const calls = { observe: 0 };
    const held = flowOf([node("a", "p1", "p1"), node("b", "p2")], [edge("a", "b")]);
    expect(await decide(held, "b", host("p1", calls), [acted("a")])).toMatchObject({ kind: "none", record: { outcome: "no_match", candidates: 1, matched: 0 } });
    const unknown = flowOf([node("a", "p1"), node("b", "p2")], [edge("a", "b")]);
    expect(await decide(unknown, "b", host("p1", calls), [acted("a")])).toMatchObject({ kind: "none", record: { outcome: "no_match" } });
    const gone = flowOf([node("a", "p1", "p2"), node("b", "p2")], [edge("a", "b")]);
    expect(await decide(gone, "b", host("p1", calls), [acted("a")])).toMatchObject({ kind: "routed", node: { id: "a" }, direction: "backward" });
  });

  it("stops when the guard refuses the route, naming the node and the count", async () => {
    const flow = flowOf([node("a", "p1", "p2"), node("b", "p2")], [edge("a", "b")]);
    const failing = flow.nodes[1]!;
    const guard = automationStudioStateRouteGuard();
    const input = { flow, node: failing, attempt: automationStudioNotShownAttempt(failing, "b.attempt.1", 1), attempts: [], options: { hostRuntime: host("p1", { observe: 0 }) }, guard };
    for (let index = 0; index < 4; index += 1) expect((await decideAutomationStudioStateRoute(input)).kind).toBe("routed");
    const stopped = await decideAutomationStudioStateRoute(input);
    expect(stopped).toMatchObject({ kind: "stopped", record: { outcome: "guard_stopped", toNodeId: "a", direction: "backward" } });
    expect(stopped.kind === "stopped" ? stopped.message : "").toMatch(/node a .*4 times.*limit of 3/u);
  });

  describe("a step whose own effect is already on the page", () => {
    /** A node that recorded what it did: the page gained `shows`. */
    const withEffect = (id: string, shows: string, before?: string, after?: string): AutomationStudioFlowNode => ({
      id,
      definitionId: "builtin.policy.action",
      metadata: { routeSignatures: { ...(before ? { before: { page: before } } : {}), ...(after ? { after: { page: after } } : {}), effect: { shows } } } as never
    });
    /** The fake host's test: the observed page's name contains what the effect shows. */
    const holds = (asked: { count: number }): Partial<Host> => ({
      routeEffectHolds: (effect, observed) => {
        asked.count += 1;
        return String(observed.page).includes(String(effect.shows));
      }
    });

    it("goes on along the step's own success edge when its effect holds, reading the page once", async () => {
      const calls = { observe: 0 };
      const asked = { count: 0 };
      const flow = flowOf([node("a", "home", "home+layer"), withEffect("b", "Millbrook", "home+layer", "home+chip"), node("c", "home")], [edge("a", "b"), edge("b", "c")]);
      const decision = await decide(flow, "b", host("home+layer:Millbrook", calls, holds(asked)), [acted("a")]);
      expect(decision).toMatchObject({
        kind: "routed",
        node: { id: "c" },
        direction: "forward",
        edge: { id: "b.success.c" },
        record: { outcome: "effect_holds", candidates: 2, matched: 0, toNodeId: "c", direction: "forward" }
      });
      expect(calls.observe).toBe(1);
      expect(asked.count).toBe(1);
    });

    it("observes a node with an effect even when no other node recorded a pre-state", async () => {
      const calls = { observe: 0 };
      const flow = flowOf([node("a"), withEffect("b", "Millbrook"), node("c")], [edge("a", "b"), edge("b", "c")]);
      const decision = await decide(flow, "b", host("home:Millbrook", calls, holds({ count: 0 })));
      expect(decision).toMatchObject({ kind: "routed", node: { id: "c" }, record: { outcome: "effect_holds", candidates: 0, matched: 0, toNodeId: "c" } });
      expect(calls.observe).toBe(1);
    });

    it("goes on to pre-state matching, on the same observation, when the effect does not hold", async () => {
      const calls = { observe: 0 };
      const asked = { count: 0 };
      const flow = flowOf([node("a", "product", "product"), withEffect("b", "Added to cart", "product", "product+added"), node("c", "cart")], [edge("a", "b"), edge("b", "c")]);
      expect(await decide(flow, "b", host("product", calls, holds(asked)), [acted("a")])).toMatchObject({ kind: "none", record: { outcome: "no_match", candidates: 2, matched: 0 } });
      expect(await decide(flow, "b", host("cart", calls, holds(asked)), [acted("a")])).toMatchObject({ kind: "routed", node: { id: "c" }, record: { outcome: "routed", matched: 1 } });
      expect(calls.observe).toBe(2);
      expect(asked.count).toBe(2);
    });

    it("is not taken to hold when the host cannot say", async () => {
      const calls = { observe: 0 };
      const flow = flowOf([node("a"), withEffect("b", "Millbrook"), node("c")], [edge("a", "b"), edge("b", "c")]);
      expect(await decide(flow, "b", host("home:Millbrook", calls))).toMatchObject({ kind: "none", record: { outcome: "no_match", candidates: 0, matched: 0 } });
      const throwing = host("home:Millbrook", calls, { routeEffectHolds: () => { throw new Error("no"); } });
      expect(await decide(flow, "b", throwing)).toMatchObject({ kind: "none", record: { outcome: "no_match" } });
    });

    it("goes on to matching when the step has no success edge, without asking the host", async () => {
      const calls = { observe: 0 };
      const asked = { count: 0 };
      const last = flowOf([node("a"), withEffect("b", "Millbrook")], [edge("a", "b"), edge("b", "a", "failed")]);
      expect(await decide(last, "b", host("home:Millbrook", calls, holds(asked)))).toEqual({ kind: "none", record: { outcome: "no_pre_states", candidates: 0, matched: 0 } });
      expect(calls.observe).toBe(0);
      expect(asked.count).toBe(0);
    });

    it("takes the effect's target through the same progress guard", async () => {
      const flow = flowOf([node("a"), withEffect("b", "Millbrook"), node("c")], [edge("a", "b"), edge("b", "c")]);
      const failing = flow.nodes[1]!;
      const input = { flow, node: failing, attempt: automationStudioNotShownAttempt(failing, "b.attempt.1", 1), attempts: [], options: { hostRuntime: host("home:Millbrook", { observe: 0 }, holds({ count: 0 })) }, guard: automationStudioStateRouteGuard() };
      for (let index = 0; index < 4; index += 1) expect((await decideAutomationStudioStateRoute(input)).kind).toBe("routed");
      expect(await decideAutomationStudioStateRoute(input)).toMatchObject({ kind: "stopped", record: { outcome: "guard_stopped", toNodeId: "c", direction: "forward" } });
    });
  });
});
