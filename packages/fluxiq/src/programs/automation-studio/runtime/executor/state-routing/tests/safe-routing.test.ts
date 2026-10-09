// The two safety guards on a state route (C6, "Safe state routing"): a
// forward route that would leave a value a later step reads unset, and a
// backward route that would repeat a completed lasting act, are refused; the
// next ranked match is tried, and with none left the decision is `none`, so
// the recovery ladder runs as before.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../../../model/index.ts";
import type { AutomationStudioGraphExecutionOptions, AutomationStudioNodeAttemptTrace } from "../../contracts.ts";
import { automationStudioNotShownAttempt, automationStudioStateRouteGuard, decideAutomationStudioStateRoute } from "../index.ts";

type Host = NonNullable<AutomationStudioGraphExecutionOptions["hostRuntime"]>;

/** A step that expected `before` (matched at `closeness`), with optional parameters and metadata. */
const step = (id: string, before?: string, extra: { closeness?: number; parameterValues?: AutomationStudioFlowNode["parameterValues"]; metadata?: NonNullable<AutomationStudioFlowNode["metadata"]> } = {}): AutomationStudioFlowNode => ({
  id,
  definitionId: "web.unregistered.press",
  ...(extra.parameterValues ? { parameterValues: extra.parameterValues } : {}),
  metadata: { ...extra.metadata, ...(before ? { routeSignatures: { before: { page: before, closeness: extra.closeness ?? 1 } } } : {}) }
});
const bind = (path: string) => ({ $state: { path } });
const lasting = { declaredConsequences: ["create_new"] };
const line = (nodes: AutomationStudioFlowNode[]): AutomationStudioFlowDocument => ({
  schemaVersion: "0.1", flowId: "flow.safe", ownerKind: "routine", ownerId: "routine.test", name: "Safe", createdAt: 1, updatedAt: 1,
  nodes, edges: nodes.slice(1).map((next, index) => ({ id: `${nodes[index]!.id}.success.${next.id}`, sourceNodeId: nodes[index]!.id, sourcePortId: "success", targetNodeId: next.id }))
});
const ran = (nodeId: string, outputs: AutomationStudioNodeAttemptTrace["outputs"] = {}): AutomationStudioNodeAttemptTrace => ({ attemptId: `${nodeId}.attempt.1`, nodeId, definitionId: "web.unregistered.press", startedAt: 1, status: "succeeded", route: "success", inputs: {}, outputs, effects: [] });

function host(page: string, extra: Partial<Host> = {}): Host {
  return {
    capabilities: [],
    observeRouteState: () => ({ page }),
    signRouteState: (state) => ({ page: String(state.page) }),
    compareRouteSignatures: (recorded, observed) => (recorded.page === observed.page ? { matches: true, closeness: Number(recorded.closeness ?? 1) } : { matches: false, closeness: 0 }),
    ...extra
  };
}

async function decide(flow: AutomationStudioFlowDocument, failingId: string, hostRuntime: Host, attempts: AutomationStudioNodeAttemptTrace[] = [], inputs?: Record<string, string>) {
  const failing = flow.nodes.find((candidate) => candidate.id === failingId)!;
  return await decideAutomationStudioStateRoute({ flow, node: failing, attempt: automationStudioNotShownAttempt(failing, `${failingId}.attempt.9`, 1), attempts, options: { hostRuntime, ...(inputs ? { inputs } : {}) }, guard: automationStudioStateRouteGuard() });
}

describe("a forward route that would leave a value unset", () => {
  // a -> b -> c -> d; b cannot run, the page matches d, and d reads what c sets.
  const flow = line([step("a", "p1"), step("b", "p2"), step("c", "p3"), step("d", "p4", { parameterValues: { query: bind("c.text") } })]);

  it("is refused, and with no other match the ladder runs", async () => {
    const decision = await decide(flow, "b", host("p4"), [ran("a")]);
    expect(decision).toMatchObject({ kind: "none", record: { outcome: "no_match", candidates: 3, matched: 0, refused: [{ toNodeId: "d", guard: "unbound_value", nodeId: "c" }] } });
    expect(decision.kind === "none" ? decision.record.reason : "").toMatch(/node d .*node c.*c\.text/u);
  });

  it("is taken when the value is already set", async () => {
    expect(await decide(flow, "b", host("p4"), [ran("a"), ran("c", { text: "x" })])).toMatchObject({ kind: "routed", node: { id: "d" }, direction: "forward" });
    expect(await decide(flow, "b", host("p4"), [ran("a")], { "c.text": "x" })).toMatchObject({ kind: "routed", node: { id: "d" }, record: { outcome: "routed", matched: 1 } });
  });

  it("gives way to the next ranked match", async () => {
    // d and e both expected this page; d is nearer, but going on at d leaves c.text unset. e reads nothing.
    const both = line([step("a", "p1"), step("b", "p2"), step("c", "p3"), step("d", "p4", { parameterValues: { query: bind("c.text") } }), step("e", "p4")]);
    const decision = await decide(both, "b", host("p4"), [ran("a")]);
    expect(decision).toMatchObject({
      kind: "routed",
      node: { id: "e" },
      direction: "forward",
      record: { outcome: "routed", matched: 1, toNodeId: "e", refused: [{ toNodeId: "d", guard: "unbound_value", nodeId: "c" }] }
    });
  });

  it("refuses the failing step's own effect when a step after it reads what it would have set", async () => {
    const own = line([step("a"), step("b", undefined, { metadata: { routeSignatures: { effect: { shows: "store" } } } }), step("c", undefined, { parameterValues: { store: bind("b.choice") } })]);
    const shown = host("home", { routeEffectHolds: () => true });
    expect(await decide(own, "b", shown)).toMatchObject({ kind: "none", record: { outcome: "no_match", candidates: 0, refused: [{ toNodeId: "c", guard: "unbound_value", nodeId: "b" }] } });
    expect(await decide(own, "b", shown, [ran("b", { choice: "x" })])).toMatchObject({ kind: "routed", node: { id: "c" }, record: { outcome: "effect_holds" } });
  });
});

describe("a backward route that would repeat a completed lasting act", () => {
  // a -> b -> c -> d; d cannot run and the page went back to a. b's act lasts.
  const flow = line([step("a", "p1"), step("b", "p2", { metadata: lasting }), step("c", "p3"), step("d", "p4")]);

  it("is refused once the act ran, and with no other match the ladder runs", async () => {
    const decision = await decide(flow, "d", host("p1"), [ran("b"), ran("c")]);
    expect(decision).toMatchObject({ kind: "none", record: { outcome: "no_match", matched: 0, refused: [{ toNodeId: "a", guard: "repeats_lasting_act", nodeId: "b" }] } });
    expect(decision.kind === "none" ? decision.record.reason : "").toMatch(/node b again.*nothing shows it did not take effect/u);
  });

  it("refuses when the host finds the act's effect on the page", async () => {
    const shown = line([step("a", "p1"), step("b", undefined, { metadata: { ...lasting, routeSignatures: { before: { page: "p2" }, effect: { added: "item" } } } }), step("c", "p3"), step("d", "p4")]);
    const decision = await decide(shown, "d", host("p1", { routeEffectHolds: () => true }), [ran("b")]);
    expect(decision).toMatchObject({ kind: "none", record: { refused: [{ toNodeId: "a", guard: "repeats_lasting_act", nodeId: "b" }] } });
    expect(decision.kind === "none" ? decision.record.reason : "").toMatch(/the page shows its effect/u);
  });

  it("is taken when the act has not run, or says repeating it is safe", async () => {
    expect(await decide(flow, "d", host("p1"), [ran("c")])).toMatchObject({ kind: "routed", node: { id: "a" }, direction: "backward" });
    const safe = line([step("a", "p1"), step("b", "p2", { metadata: { ...lasting, idempotent: true } }), step("c", "p3"), step("d", "p4")]);
    expect(await decide(safe, "d", host("p1"), [ran("b")])).toMatchObject({ kind: "routed", node: { id: "a" }, direction: "backward" });
  });

  it("gives way to the next ranked match that repeats nothing", async () => {
    // a and c both expected this page; a matches closer, but going back to a repeats b. c is after b.
    const both = line([step("a", "p1", { closeness: 1 }), step("b", "p2", { metadata: lasting }), step("c", "p1", { closeness: 0.8 }), step("d", "p4")]);
    const decision = await decide(both, "d", host("p1"), [ran("b")]);
    expect(decision).toMatchObject({
      kind: "routed",
      node: { id: "c" },
      direction: "backward",
      closeness: 0.8,
      record: { outcome: "routed", matched: 1, toNodeId: "c", refused: [{ toNodeId: "a", guard: "repeats_lasting_act", nodeId: "b" }] }
    });
  });
});
