// t661: the run detail drops state routing's reason sentence by design (it repeats the host's words), so nobody could
// tell why routing answered no_match on the A8 bigbox cart run (`run-mvac0ddx-f52ba929`). Every no_match now records
// why as a closed code, `noMatchCause`, one for each case the decision tells apart; no other outcome carries one.

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../../../model/index.ts";
import type { AutomationStudioGraphExecutionOptions, AutomationStudioNodeAttemptTrace } from "../../contracts.ts";
import { automationStudioNotShownAttempt, automationStudioStateRouteGuard, decideAutomationStudioStateRoute } from "../index.ts";

type Host = NonNullable<AutomationStudioGraphExecutionOptions["hostRuntime"]>;

const step = (id: string, signatures: { before?: string; after?: string; effect?: string } = {}, extra: { parameterValues?: AutomationStudioFlowNode["parameterValues"]; metadata?: JsonObject } = {}): AutomationStudioFlowNode => ({
  id, definitionId: "web.unregistered.press",
  ...(extra.parameterValues ? { parameterValues: extra.parameterValues } : {}),
  metadata: { ...extra.metadata, routeSignatures: {
    ...(signatures.before ? { before: { page: signatures.before } } : {}), ...(signatures.after ? { after: { page: signatures.after } } : {}), ...(signatures.effect ? { effect: { shows: signatures.effect } } : {})
  } }
});
const line = (nodes: AutomationStudioFlowNode[]): AutomationStudioFlowDocument => ({
  schemaVersion: "0.1", flowId: "flow.cause", ownerKind: "routine", ownerId: "routine.test", name: "Cause", createdAt: 1, updatedAt: 1,
  nodes, edges: nodes.slice(1).map((next, index) => ({ id: `${nodes[index]!.id}.${next.id}`, sourceNodeId: nodes[index]!.id, sourcePortId: "success", targetNodeId: next.id }))
});
const ran = (nodeId: string): AutomationStudioNodeAttemptTrace => ({ attemptId: `${nodeId}.attempt.1`, nodeId, definitionId: "web.unregistered.press", startedAt: 1, status: "succeeded", route: "success", inputs: {}, outputs: {}, effects: [] });
const host = (page: string, effectOnPage = false): Host => ({
  capabilities: [],
  observeRouteState: () => ({ page }),
  signRouteState: (state) => ({ page: String(state.page) }),
  compareRouteSignatures: (recorded, observed) => (recorded.page === observed.page ? { matches: true, closeness: 1 } : { matches: false, closeness: 0 }),
  routeEffectHolds: () => effectOnPage
});

async function cause(flow: AutomationStudioFlowDocument, failingId: string, hostRuntime: Host, attempts: AutomationStudioNodeAttemptTrace[] = []) {
  const failing = flow.nodes.find((each) => each.id === failingId)!;
  const decision = await decideAutomationStudioStateRoute({ flow, node: failing, attempt: automationStudioNotShownAttempt(failing, `${failingId}.attempt.9`, 1), attempts, options: { hostRuntime }, guard: automationStudioStateRouteGuard() });
  if (decision.kind !== "none") throw new Error(`expected no way on, got ${decision.kind}`);
  return decision.record;
}

describe("why a no_match found no way on", () => {
  it("effect_not_on_page: the step recorded its own effect, the page did not show it, and no other step recorded a starting page", async () => {
    const flow = line([step("shelf"), step("reserve", { effect: "On hold" }), step("done")]);
    expect(await cause(flow, "reserve", host("catalogue"))).toMatchObject({ outcome: "no_match", noMatchCause: "effect_not_on_page" });
  });

  it("effect_route_refused: the page showed the step's own effect, and going on past it was refused", async () => {
    const flow = line([step("shelf"), step("branch", { effect: "Eastside" }), step("search", {}, { parameterValues: { branch: { $state: { path: "branch.choice" } } } })]);
    expect(await cause(flow, "branch", host("catalogue", true))).toMatchObject({ outcome: "no_match", noMatchCause: "effect_route_refused", refused: [{ guard: "unbound_value" }] });
  });

  it("matches_refused: the page matched other steps' starting pages, and a guard refused each", async () => {
    const flow = line([step("open", { before: "p1", after: "p1+list" }), step("borrow", { before: "p2" }, { metadata: { declaredConsequences: ["create_new"] } }), step("renew", { before: "p3" })]);
    expect(await cause(flow, "renew", host("p1"), [ran("open"), ran("borrow")])).toMatchObject({ outcome: "no_match", noMatchCause: "matches_refused", refused: [{ toNodeId: "open", guard: "repeats_lasting_act" }] });
  });

  it("matching_steps_already_acted: the steps whose starting page matched had acted, and nothing shows their effect gone", async () => {
    const flow = line([step("open", { before: "p1", after: "p1" }), step("renew", { before: "p2" })]);
    expect(await cause(flow, "renew", host("p1"), [ran("open")])).toMatchObject({ outcome: "no_match", noMatchCause: "matching_steps_already_acted" });
  });

  it("no_step_matches_page: the page matched no step's starting page", async () => {
    const flow = line([step("open", { before: "p1" }), step("renew", { before: "p2" })]);
    expect(await cause(flow, "renew", host("elsewhere"))).toMatchObject({ outcome: "no_match", noMatchCause: "no_step_matches_page" });
  });

  it("is carried on no other outcome", async () => {
    const unobserved = line([step("open", { before: "p1" }), step("renew", { before: "p2" })]);
    const blind = await cause(unobserved, "renew", { capabilities: [] });
    expect(blind.outcome).toBe("unobserved");
    expect(blind).not.toHaveProperty("noMatchCause");
    const nothing = await cause(line([step("open"), step("renew")]), "renew", host("p1"));
    expect(nothing.outcome).toBe("no_pre_states");
    expect(nothing).not.toHaveProperty("noMatchCause");
  });
});
