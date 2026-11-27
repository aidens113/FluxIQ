// A step passed over as "state never arose" still owes the route its recorded effect
// went to (`../route-owed.ts`, t1083), built from bigbox `run-mwz29d50-c3a32a9c`'s
// attempt 2: s11 "Add to cart" answered `already_done`, s12 the drawer's "View cart"
// failed `target_not_found`, and s13 the cart read. Before t1083 the decision went
// from s12 straight to s13 on the product page; now the host is asked to bring the
// page to the cart first, and the attempt says how.

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioFlowEdge, AutomationStudioFlowNode } from "../../../../flows/executable/graph/index.ts";
import type { AutomationStudioRouteReachAnswer, AutomationStudioRouteReachRequest } from "../../../../runtime/automation-host/contracts/index.ts";
import type { AutomationStudioHostRuntimeBoundary } from "../../../../runtime/automation-host/index.ts";
import type { AutomationStudioFlowDocument } from "../../tests/fixture-contracts.ts";
import type { AutomationStudioNodeAttemptTrace } from "../../index.ts";
import { AUTOMATION_STUDIO_STATE_NOT_ARISEN_CODE, automationStudioNotArisenRouteOwed, automationStudioStateNotArisenWayOn, automationStudioStateRoutedAttempt, automationStudioStateRouteGuard, decideAutomationStudioStateRoute } from "../index.ts";

/** s12's recorded effect as task memory kept it for step d10 (the product page to the cart), hashes only. */
const VIEW_CART_EFFECT: JsonObject = {
  v: "web-effect.v1",
  added: ["01dae98c", "0e42696d", "2482e37a", "24938f56", "6c3589cb", "7a00f8df", "bcfdba09", "c5eb38da", "eb5e6149", "ebf5d181"],
  removed: ["069b17c9", "090b5119", "0c289034", "12de7428", "22e2b264", "2d333e29", "2e1f3d5f", "2e89dbd4", "472a0d6e", "756de015", "75dc6e14", "7a1add77", "8a724555", "9f18354c", "aa72f580", "b81f032a"],
  path: "53622792"
};

const NODE = "node.bootstrap.a0036f0c3f062adf.main";
const add: AutomationStudioFlowNode = { id: `${NODE}.s11`, definitionId: "web.output.dom-click", label: "Add to cart", parameterValues: { selector: "[data-testid=\"atc\"]" }, metadata: { declaredConsequences: ["modify_existing"] } };
const viewCart: AutomationStudioFlowNode = {
  id: `${NODE}.s12`,
  definitionId: "web.output.dom-click",
  label: "View cart",
  parameterValues: { selector: "body > aside > a", element: { tagName: "a", implicitRole: "link", accessibleName: "View cart", selector: "body > aside > a", context: { landmark: "complementary" } } },
  metadata: { declaredConsequences: [], routeSignatures: { effect: VIEW_CART_EFFECT } }
};
const cartRead: AutomationStudioFlowNode = { id: `${NODE}.s13`, definitionId: "web.output.dom-extract_list", parameterValues: { recordOutput: { datasetId: "step.cart_read2.v1" } } };

function flowOf(follow: AutomationStudioFlowNode = viewCart): AutomationStudioFlowDocument {
  const nodes = [add, follow, cartRead, { id: "done", definitionId: "builtin.control.end" }];
  const link = (from: string, to: string): AutomationStudioFlowEdge => ({ id: `${from}-${to}`, sourceNodeId: from, sourcePortId: "success", targetNodeId: to, targetPortId: "in" });
  return { schemaVersion: "0.1", flowId: "flow.34fbe190", ownerKind: "routine", ownerId: "506ef250", name: "Cheapest towels", createdAt: 1, updatedAt: 1, metadata: { projectId: "506ef250" }, nodes, edges: [link(add.id, follow.id), link(follow.id, cartRead.id), link(cartRead.id, "done")] };
}

function attempt(node: AutomationStudioFlowNode, extra: Partial<AutomationStudioNodeAttemptTrace> = {}): AutomationStudioNodeAttemptTrace {
  return { attemptId: `${node.id}.attempt.1`, nodeId: node.id, definitionId: node.definitionId, startedAt: 1, finishedAt: 1, status: "succeeded", route: "success", inputs: {}, outputs: {}, effects: [], ...extra };
}

/** s11 as the run gate answered it: nothing sent, the act already done. */
const addAlreadyDone = () => attempt(add, { outputs: { skipped: "already_done" } });
/** s12 as the client answered it: no target resolved on the product page. */
const viewCartNotFound = (node: AutomationStudioFlowNode = viewCart) => attempt(node, { status: "failed", route: "failed", failure: { category: "target_not_found", code: "web.target.not_found", retryable: true, stage: "target_resolution", effect: "unacted" } });

/** Every web click floored `commit`, as the web domain floors it. */
const click = { resolveActionEffect: () => ({ effectClass: "commit" as const, permissionConsequences: [] }) };

function hostAnswering(answer: AutomationStudioRouteReachAnswer | (() => never)): { host: AutomationStudioHostRuntimeBoundary; asked: AutomationStudioRouteReachRequest[] } {
  const asked: AutomationStudioRouteReachRequest[] = [];
  return {
    asked,
    host: {
      capabilities: [],
      reachRouteEffect: (request) => {
        asked.push(request);
        return typeof answer === "function" ? answer() : answer;
      }
    }
  };
}

const decide = (hostRuntime: AutomationStudioHostRuntimeBoundary | undefined, node: AutomationStudioFlowNode = viewCart) =>
  decideAutomationStudioStateRoute({ flow: flowOf(node), node, attempt: viewCartNotFound(node), attempts: [addAlreadyDone(), viewCartNotFound(node)], options: { ...click, ...(hostRuntime ? { hostRuntime } : {}) }, guard: automationStudioStateRouteGuard() });

describe("run-mwz29d50 attempt 2: View cart passed over as never arisen", () => {
  it("is passed over only once the host has brought the page to the cart its recorded effect went to", async () => {
    const { host, asked } = hostAnswering("pressed");
    const decision = await decide(host);
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatchObject({ node: { id: viewCart.id }, effect: VIEW_CART_EFFECT, projectId: "506ef250", flowId: "flow.34fbe190" });
    expect(decision).toMatchObject({ kind: "declared", code: AUTOMATION_STUDIO_STATE_NOT_ARISEN_CODE, reached: "pressed", edge: { targetNodeId: cartRead.id } });
  });

  it("records how the route was reached on the passed-over attempt, so it is told from one passed over as saved", async () => {
    for (const reached of ["already_there", "pressed", "went"] as const) {
      const decision = await decide(hostAnswering(reached).host);
      const recorded = automationStudioStateRoutedAttempt(viewCartNotFound(), decision);
      expect(recorded).toMatchObject({ status: "succeeded", route: "skipped", skipped: { reason: "target_absent", code: AUTOMATION_STUDIO_STATE_NOT_ARISEN_CODE, reached } });
    }
  });

  it("is not passed over when the page could not be brought there, nor when the host threw or answered nonsense", async () => {
    for (const answer of ["unreached", (() => { throw new Error("gateway gone"); }) as () => never, "maybe"] as Array<AutomationStudioRouteReachAnswer | (() => never)>) {
      const decision = await decide(hostAnswering(answer).host);
      expect(decision.kind).toBe("none");
      if (decision.kind === "none") expect(decision.record.reason).toMatch(/could not be brought to where its recorded effect went/u);
    }
  });

  it("is passed over as before when the effect moved to no other route, the host cannot reach routes, or the step recorded no effect", async () => {
    const stays = await decide(hostAnswering("stays").host);
    expect(stays).toMatchObject({ kind: "declared", code: AUTOMATION_STUDIO_STATE_NOT_ARISEN_CODE, edge: { targetNodeId: cartRead.id } });
    expect(stays).not.toHaveProperty("reached");
    expect(await decide({ capabilities: [] })).not.toHaveProperty("reached");
    const unsigned: AutomationStudioFlowNode = { ...viewCart, metadata: { declaredConsequences: [] } };
    const { host, asked } = hostAnswering("pressed");
    expect(await decide(host, unsigned)).toMatchObject({ kind: "declared", code: AUTOMATION_STUDIO_STATE_NOT_ARISEN_CODE });
    expect(asked).toHaveLength(0);
  });

  it("never asks the host for a step that is not passed over: a follow-on that does a lasting act keeps its recovery", async () => {
    const lasting: AutomationStudioFlowNode = { ...viewCart, metadata: { ...viewCart.metadata, declaredConsequences: ["create_new"] } };
    const { host, asked } = hostAnswering("pressed");
    expect((await decide(host, lasting)).kind).toBe("none");
    expect(asked).toHaveLength(0);
  });
});

describe("a chain of steps passed over as never arisen", () => {
  it("ends at a step whose route was reached: the page it brings about has come", () => {
    const reached = attempt(viewCart, { route: "skipped", skipped: { reason: "target_absent", code: AUTOMATION_STUDIO_STATE_NOT_ARISEN_CODE, reached: "pressed" } });
    const passed = attempt(viewCart, { route: "skipped", skipped: { reason: "target_absent", code: AUTOMATION_STUDIO_STATE_NOT_ARISEN_CODE } });
    const checkout: AutomationStudioFlowNode = { id: "checkout", definitionId: "web.output.dom-click" };
    const flow = { ...flowOf(), nodes: [...flowOf().nodes, checkout], edges: [...flowOf().edges, { id: "e-checkout", sourceNodeId: checkout.id, sourcePortId: "success", targetNodeId: "done", targetPortId: "in" }] };
    const failed = attempt(checkout, { status: "failed", route: "failed" });
    expect(automationStudioStateNotArisenWayOn({ flow, node: checkout, attempts: [reached, failed] })).toBeUndefined();
    expect(automationStudioStateNotArisenWayOn({ flow, node: checkout, attempts: [passed, failed] })?.targetNodeId).toBe("done");
  });
});

describe("the owed route on its own", () => {
  it("asks nothing of a host without the method and reads it as nothing owed", async () => {
    expect(await automationStudioNotArisenRouteOwed({ node: viewCart, hostRuntime: undefined, projectId: "p", flowId: "f" })).toBe("stays");
    expect(await automationStudioNotArisenRouteOwed({ node: viewCart, hostRuntime: { capabilities: [] }, projectId: "p", flowId: "f" })).toBe("stays");
  });
});
