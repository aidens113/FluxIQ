// The "Step N of M" a person reads while a Flow plays back (D2, D5 of the UI
// review of `run-murwd8le-79e735a8`, t174/w88). The counter advanced on a
// retry: "Step 11 of 14: Clicking “Get coupons”" became "Step 12 of 14" for the
// same click, and every step after it was one too high. A step's number is its
// place in the Flow, so a retry keeps it. A Merge ("Join paths") is graph
// plumbing a person never sees as a step: it is not announced and not counted
// in "of M". And a failed step's recovery opens with no bare "Recovery started"
// row of its own: the thought that says what recovery chose is the one row.

import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../../model/index.ts";
import { automationStudioActivityHub, runWithAutomationStudioActivity } from "../../activity/index.ts";
import { runAutomationStudioGraph, type AutomationStudioGraphExecutionOptions, type AutomationStudioGraphExecutionTrace } from "../index.ts";

let seen: ClientGatewayActivity[] = [];
let unsubscribe: () => void = () => undefined;
beforeEach(() => {
  seen = [];
  unsubscribe = automationStudioActivityHub.subscribe((event) => seen.push(event));
});
afterEach(() => unsubscribe());

const press = (id: string, elementId: string, label: string): AutomationStudioFlowNode => ({
  id,
  label,
  definitionId: "builtin.policy.action",
  parameterValues: { outputId: "activate-element", parameters: { elementId } } as NonNullable<AutomationStudioFlowNode["parameterValues"]>
});
const merge = (id: string): AutomationStudioFlowNode => ({ id, definitionId: "builtin.control.merge", parameterValues: { mergeMode: "first" } });
const edge = (sourceNodeId: string, sourcePortId: string, targetNodeId: string, targetPortId = "in") => ({ id: `${sourceNodeId}.${sourcePortId}.${targetNodeId}`, sourceNodeId, sourcePortId, targetNodeId, targetPortId });

function flowOf(nodes: AutomationStudioFlowNode[], edges: AutomationStudioFlowDocument["edges"]): AutomationStudioFlowDocument {
  return { schemaVersion: "0.1", flowId: "flow.step-counter", ownerKind: "routine", ownerId: "routine.test", name: "Step counter", createdAt: 1, updatedAt: 1, nodes, edges };
}

/** Fails the first press of `flaky` as the page being busy, the way "Get coupons" did; every other press works. */
function flakyOnce(flaky: string): NonNullable<AutomationStudioGraphExecutionOptions["effectDispatcher"]> {
  let failed = false;
  return (effect) => {
    const payload = JSON.stringify(effect.payload ?? null);
    if (!failed && payload.includes(`"${flaky}"`)) {
      failed = true;
      return { status: "failed", route: "failed", message: "The page said it was busy.", failure: { category: "timeout", code: "web.action.timed_out", retryable: true, stage: "execution" } };
    }
    return { status: "success", route: "success", outputs: { ok: true } };
  };
}

async function inRun(flow: AutomationStudioFlowDocument, options: AutomationStudioGraphExecutionOptions): Promise<AutomationStudioGraphExecutionTrace> {
  return await runWithAutomationStudioActivity({ kind: "run", id: "run.1", projectId: "project.1", flowId: flow.flowId }, () => runAutomationStudioGraph(flow, { delay: async () => undefined, ...options }));
}

const running = () => seen.filter((event) => event.phase === "running" && event.step !== undefined).map((event) => [event.step!.nodeId, event.step!.index, event.step!.count, event.label] as const);

// Ids sort in another order than the Flow runs (a recorded node's id carries an
// unpadded number), so a number taken from the list order would be wrong too.
const flow = flowOf(
  [press("n9.open", "open", "Open the item"), merge("n10.join"), press("n2.coupon", "coupon", "Get coupons"), press("n1.cart", "cart", "Add to cart")],
  [edge("n9.open", "success", "n10.join", "branches"), edge("n10.join", "success", "n2.coupon"), edge("n2.coupon", "success", "n1.cart")]
);

describe("the step counter a person reads in playback", () => {
  it("keeps a step's number when that step is tried again, and counts no Merge", async () => {
    const trace = await inRun(flow, { effectDispatcher: flakyOnce("coupon") });

    expect(trace.status).toBe("succeeded");
    expect(trace.attempts.filter((attempt) => attempt.nodeId === "n2.coupon")).toHaveLength(2);
    expect(running()).toEqual([
      ["n9.open", 1, 3, "Running step 1 of 3: Open the item"],
      ["n2.coupon", 2, 3, "Running step 2 of 3: Get coupons"],
      ["n2.coupon", 2, 3, "Running step 2 of 3: Get coupons"],
      ["n1.cart", 3, 3, "Running step 3 of 3: Add to cart"]
    ]);
  });

  it("numbers a step by its place in the Flow when a partial run starts part-way", async () => {
    await inRun(flow, { effectDispatcher: flakyOnce("none"), startNodeId: "n2.coupon" });

    expect(running().map(([node, index, count]) => [node, index, count])).toEqual([["n2.coupon", 2, 3], ["n1.cart", 3, 3]]);
  });

  it("puts both sides of a fork before the Merge that joins them", async () => {
    const forked = flowOf(
      [press("a", "a", "Open"), press("b", "b", "Close the offer"), merge("j"), press("c", "c", "Search")],
      [edge("a", "success", "j", "branches"), edge("a", "success", "b"), edge("b", "success", "j", "branches"), edge("j", "success", "c")]
    );
    await inRun(forked, { effectDispatcher: flakyOnce("none") });

    expect(running().map(([node, index, count]) => [node, index, count])).toEqual([["a", 1, 3], ["c", 3, 3]]);
  });
});

describe("the rows a failed step's recovery opens with", () => {
  it("say no bare \"Recovery started\" row beside the thought that says what recovery chose", async () => {
    await inRun(flow, { effectDispatcher: flakyOnce("coupon") });

    expect(seen.some((event) => event.detail?.title === "Recovery started")).toBe(false);
    const repairing = seen.filter((event) => event.phase === "repairing");
    expect(repairing.length).toBeGreaterThan(0);
    // The live line still says what is being recovered; only the chat row is gone.
    expect(repairing[0]!.label).toBe("Recovering from a failed step: Get coupons");
    // Besides the thought, only the row that settles the failed step (no step of
    // its own, so no chat row of its own: `failed-step-reason.test.ts`).
    expect(repairing.filter((event) => event.detail !== undefined).every((event) => event.detail!.kind === "thought" || (event.detail!.kind === "step" && event.detail!.status === "failed" && event.step === undefined))).toBe(true);
  });
});
