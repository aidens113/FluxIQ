// t661, A8 bigbox cart (`run-mvac0ddx-f52ba929`): a step opened a store picker, an optional step after it found nothing
// to do, and the picker was closed again before the step that used it. That step's control was then on the page with
// no box (`shown: false`), the page matched no step's recorded starting page, and routing answered no_match. A step
// whose control was measured on the page but not shown now goes back once to the step that showed it -- the nearest
// earlier step that acted and recorded an after-state, whose act does not last and whose recorded after-state is the
// failing step's recorded starting page. A hardware-store fixture: an aisle menu a step opens, then the paint aisle.

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../../../model/index.ts";
import type { AutomationStudioGraphExecutionOptions, AutomationStudioNodeAttemptTrace } from "../../contracts.ts";
import { automationStudioStateReopenOpener, automationStudioStateRouteGuard, decideAutomationStudioStateRoute, type AutomationStudioStateRouteGuard } from "../index.ts";

type Host = NonNullable<AutomationStudioGraphExecutionOptions["hostRuntime"]>;

const node = (id: string, signatures: { before?: string; after?: string } = {}, metadata: JsonObject = {}): AutomationStudioFlowNode => ({
  id, definitionId: "web.unregistered.press",
  metadata: { ...metadata, ...(signatures.before || signatures.after ? { routeSignatures: { ...(signatures.before ? { before: { page: signatures.before } } : {}), ...(signatures.after ? { after: { page: signatures.after } } : {}) } } : {}) }
});
const edge = (from: string, to: string) => ({ id: `${from}.${to}`, sourceNodeId: from, sourcePortId: "success", targetNodeId: to });
const flowOf = (nodes: AutomationStudioFlowNode[]): AutomationStudioFlowDocument => ({
  schemaVersion: "0.1", flowId: "flow.store", ownerKind: "routine", ownerId: "routine.store", name: "Store", createdAt: 1, updatedAt: 1,
  nodes, edges: nodes.slice(1).map((next, index) => edge(nodes[index]!.id, next.id))
});
let attempts = 0;
const acted = (nodeId: string): AutomationStudioNodeAttemptTrace => ({ attemptId: `${nodeId}.attempt.${++attempts}`, nodeId, definitionId: "web.unregistered.press", startedAt: 1, status: "succeeded", route: "success", inputs: {}, outputs: {}, effects: [] });
/** The paint aisle's press: its control found, scored well, and measured on the page but not shown -- or as `measured` says. */
const hidden = (measured: Record<string, string | number | boolean> = { shown: false }): AutomationStudioNodeAttemptTrace => ({
  attemptId: `paint.attempt.${++attempts}`, nodeId: "paint", definitionId: "web.unregistered.press", startedAt: 2, status: "failed", inputs: {}, effects: [],
  failure: { category: "target_not_found", code: "web.target.not_shown", retryable: true, stage: "target_resolution" },
  outputs: { result: { result: { status: "failed", resolution: { strategy: "fingerprint", candidateCount: 1, bestScore: 0.71, ...measured } } } }
});
/** The page now: the menu closed, and a chat card the recorded pages never had, so no recorded starting page matches. */
const host: Host = {
  capabilities: [],
  observeRouteState: () => ({ page: "home+chat" }),
  signRouteState: (state) => ({ page: String(state.page) }),
  compareRouteSignatures: (recorded, observed) => (recorded.page === observed.page ? { matches: true, closeness: 1 } : { matches: false, closeness: 0 })
};

const home = node("home", { before: "start", after: "home" });
const aisles = node("aisles", { before: "home", after: "home+menu" });
const join = node("join");
const paint = node("paint", { before: "home+menu" });
const store = flowOf([home, aisles, join, paint]);

async function decide(flow: AutomationStudioFlowDocument, attempt: AutomationStudioNodeAttemptTrace, ran: AutomationStudioNodeAttemptTrace[], guard: AutomationStudioStateRouteGuard = automationStudioStateRouteGuard()) {
  return await decideAutomationStudioStateRoute({ flow, node: flow.nodes.find((each) => each.id === "paint")!, attempt, attempts: [...ran, attempt], options: { hostRuntime: host }, guard });
}

describe("a step whose control was on the page but not shown", () => {
  it("goes back once to the step that showed it, passing over a step that recorded nothing", async () => {
    const decision = await decide(store, hidden(), [acted("home"), acted("aisles"), acted("join")]);
    expect(decision).toMatchObject({ kind: "routed", node: { id: "aisles" }, direction: "backward", reopen: true, record: { outcome: "routed", toNodeId: "aisles", direction: "backward" } });
  });

  it("stops on a second return with nothing done since, and goes back again once the run has made progress", async () => {
    const guard = automationStudioStateRouteGuard();
    const ran = [acted("home"), acted("aisles"), acted("join")];
    expect((await decide(store, hidden(), ran, guard)).kind).toBe("routed");
    // The opener ran again and the control was hidden again: nothing new acted, so the run stops rather than loop.
    const again = [...ran, hidden(), acted("aisles"), acted("join")];
    const stopped = await decide(store, hidden(), again, guard);
    expect(stopped).toMatchObject({ kind: "stopped", record: { outcome: "guard_stopped", toNodeId: "aisles", direction: "backward" } });
    expect(stopped.kind === "stopped" ? stopped.message : "").toMatch(/^The run stopped: Node paint's control was on the page but not shown again after the run went back to node aisles/u);
    // A step that acted for the first time in between is progress: one more return is allowed.
    const progressed = flowOf([home, aisles, node("filter"), join, paint]);
    expect(await decide(progressed, hidden(), [...again, acted("filter")], guard)).toMatchObject({ kind: "routed", node: { id: "aisles" }, reopen: true });
  });

  it("never runs a lasting-act opener again", async () => {
    const lastingAisles = node("aisles", { before: "home", after: "home+menu" }, { declaredConsequences: ["create_new"] });
    const flow = flowOf([home, lastingAisles, join, paint]);
    expect(automationStudioStateReopenOpener({ flow, node: paint, attempt: hidden(), attempts: [acted("home"), acted("aisles"), acted("join")], hostRuntime: host })).toBeUndefined();
    expect(await decide(flow, hidden(), [acted("home"), acted("aisles"), acted("join")])).toMatchObject({ kind: "none", record: { outcome: "no_match" } });
  });

  it("never goes back across a completed lasting act between the opener and the step", async () => {
    const flow = flowOf([home, aisles, node("cart", {}, { declaredConsequences: ["create_new"] }), paint]);
    const decision = await decide(flow, hidden(), [acted("home"), acted("aisles"), acted("cart")]);
    // The nearest step that recorded an after-state is still the menu's opener, but the way back would add to the cart again.
    expect(decision).toMatchObject({ kind: "none", record: { outcome: "no_match", refused: [{ toNodeId: "aisles", guard: "repeats_lasting_act", nodeId: "cart" }] } });
  });

  it("takes no way back on anything but Core's own record", async () => {
    const ran = [acted("home"), acted("aisles"), acted("join")];
    // The domain did not say not shown: no measurement, or a shown field that is not exactly false.
    for (const measured of [{}, { shown: "false" }, { shown: true }]) expect(await decide(store, hidden(measured), ran)).toMatchObject({ kind: "none", record: { outcome: "no_match", noMatchCause: "no_step_matches_page" } });
    // The opener's recorded after-state is not the page the step's control was shown on.
    const elsewhere = flowOf([home, node("aisles", { before: "home", after: "home+cart" }), join, paint]);
    expect((await decide(elsewhere, hidden(), ran)).kind).toBe("none");
    // The failing step recorded no starting page, so nothing says where its control was shown.
    const unrecorded = flowOf([home, aisles, join, node("paint")]);
    expect(automationStudioStateReopenOpener({ flow: unrecorded, node: unrecorded.nodes[3]!, attempt: hidden(), attempts: ran, hostRuntime: host })).toBeUndefined();
    // No earlier step acted with a recorded after-state.
    expect(automationStudioStateReopenOpener({ flow: store, node: paint, attempt: hidden(), attempts: [acted("join")], hostRuntime: host })).toBeUndefined();
  });
});
