// What a failed playback step's card can say about why it failed (D8 of the UI
// review of `run-murwd8le-79e735a8`, t174/w90). "Click · Get coupons — Didn't
// work" gave no reason, though the press's result was `web.action.rate_limited`
// ("Action refused by the page for now: it said it was busy"): no row after
// the step carried its result code, so a chat could only infer the failure
// from the recovery that followed. The row that opens the recovery now settles
// the step it recovers, with the failure's code in the record a tool row
// carries, and Core's shared reading words it ("the page was busy").
//
// And a playback through a Merge shows no "Join paths" card: the merge is
// plumbing on the Flow's paths, never announced (t174/w88), and no row of the
// whole sequence reads as a join.

import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { activityActionOf } from "../../../../../ui/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../../model/index.ts";
import { automationStudioActivityHub, runWithAutomationStudioActivity } from "../../activity/index.ts";
import { runAutomationStudioGraph, type AutomationStudioGraphExecutionOptions } from "../index.ts";

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

const flow: AutomationStudioFlowDocument = {
  schemaVersion: "0.1",
  flowId: "flow.failed-step-reason",
  ownerKind: "routine",
  ownerId: "routine.test",
  name: "Failed step reason",
  createdAt: 1,
  updatedAt: 1,
  nodes: [press("n1.open", "open", "Open the item"), merge("n2.join"), press("n3.coupon", "coupon", "Get coupons"), press("n4.cart", "cart", "Add to cart")],
  edges: [edge("n1.open", "success", "n2.join", "branches"), edge("n2.join", "success", "n3.coupon"), edge("n3.coupon", "success", "n4.cart")]
};

/** Refuses the first press of "coupon" the way the page did in 0081: busy, naming no wait. */
function busyOnce(): NonNullable<AutomationStudioGraphExecutionOptions["effectDispatcher"]> {
  let refused = false;
  return (effect) => {
    if (!refused && JSON.stringify(effect.payload ?? null).includes("\"coupon\"")) {
      refused = true;
      return { status: "failed", route: "failed", message: "Action refused by the page for now: it said it was busy; it named no wait.", failure: { category: "timeout", code: "web.action.rate_limited", retryable: true, stage: "execution", effect: "unacted" } };
    }
    return { status: "success", route: "success", outputs: { ok: true } };
  };
}

async function played(): Promise<void> {
  await runWithAutomationStudioActivity({ kind: "run", id: "run.1", projectId: "project.1", flowId: flow.flowId }, () => runAutomationStudioGraph(flow, { delay: async () => undefined, effectDispatcher: busyOnce() }));
}

describe("a failed playback step's row", () => {
  it("is settled, by the row right after it, with the failure's code that words why it failed", async () => {
    await played();

    const started = seen.findIndex((event) => event.step?.nodeId === "n3.coupon");
    expect(started).toBeGreaterThan(-1);
    const settle = seen[started + 1]!;
    expect(settle.phase).toBe("repairing");
    expect(settle.label).toBe("Recovering from a failed step: Get coupons");
    expect(settle.step).toBeUndefined();
    expect(settle.detail).toMatchObject({ kind: "step", status: "failed", ref: "n3.coupon" });
    expect(settle.detail!.text).toContain("Result: web.action.rate_limited");
    // Only codes travel in the record; the page's own sentence is never a row's words.
    expect(settle.detail!.text).not.toContain("busy;");
    const read = activityActionOf(settle);
    expect(read?.outcome).toBe("failed");
    expect(read?.why).toBe("the page was busy");
  });

  it("still opens no bare \"Recovery started\" row", async () => {
    await played();

    expect(seen.some((event) => event.detail?.title === "Recovery started")).toBe(false);
  });
});

describe("a playback through a Merge", () => {
  it("has no row that reads as joining the paths", async () => {
    await played();

    expect(seen.some((event) => event.step?.nodeId === "n2.join" || event.detail?.ref === "n2.join")).toBe(false);
    expect(seen.map((event) => activityActionOf(event)?.kind).filter((kind) => kind === "join")).toEqual([]);
  });
});
