import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../../../model/index.ts";
import { automationStudioActivityHub, runWithAutomationStudioActivity } from "../../../activity/index.ts";
import { announceAutomationStudioStateRoute } from "../index.ts";

let seen: ClientGatewayActivity[] = [];
let unsubscribe: () => void = () => undefined;
beforeEach(() => {
  seen = [];
  unsubscribe = automationStudioActivityHub.subscribe((event) => seen.push(event));
});
afterEach(() => unsubscribe());

const node = (id: string, definitionId: string, extra: Partial<AutomationStudioFlowNode> = {}): AutomationStudioFlowNode => ({ id, definitionId, ...extra });
const edge = (from: string, to: string) => ({ id: `${from}.success.${to}`, sourceNodeId: from, sourcePortId: "success", targetNodeId: to });
// Listed out of run order, as the project graph index hands nodes back sorted by id.
const press = node("n.c", "web.output.dom-click", { parameterValues: { element: { accessibleName: "Set as my store" } } as never });
const open = node("n.a", "builtin.policy.action");
const plain = node("n.b", "builtin.policy.action");
const last = node("n.d", "builtin.policy.action");
const flow: AutomationStudioFlowDocument = {
  schemaVersion: "0.1", flowId: "flow.announce", ownerKind: "routine", ownerId: "routine.test", name: "Announce", createdAt: 1, updatedAt: 1,
  nodes: [press, last, plain, open],
  edges: [edge("n.a", "n.b"), edge("n.b", "n.c"), edge("n.c", "n.d")]
};
const routed = (to: AutomationStudioFlowNode, direction: "forward" | "backward", outcome: "routed" | "effect_holds" = "routed") =>
  ({ kind: "routed", node: to, direction, record: { outcome, candidates: 1, matched: 1, toNodeId: to.id, direction } }) as const;

async function said(from: AutomationStudioFlowNode, to: AutomationStudioFlowNode, direction: "forward" | "backward", outcome?: "routed" | "effect_holds"): Promise<string> {
  seen = [];
  await runWithAutomationStudioActivity({ kind: "run", id: "run-announce", projectId: "p1" }, async () => {
    announceAutomationStudioStateRoute(flow, from, routed(to, direction, outcome));
  });
  return seen.at(-1)!.label;
}

describe("announceAutomationStudioStateRoute", () => {
  it("names an unlabelled step by what it does, else by its place in run order, never the store's (run-muw5zv4m-52d83027)", async () => {
    expect(await said(press, last, "forward")).toBe("Skipped clicking “Set as my store”: the page is already past it. Continuing with step 4");
    expect(await said(plain, last, "forward")).toBe("Skipped step 2: the page is already past it. Continuing with step 4");
    expect(await said(last, open, "backward")).toBe("Skipped step 4: the page went back to an earlier step. Continuing with step 1");
    expect(await said(plain, press, "forward", "effect_holds")).toBe("Skipped step 2: the page already shows what it does. Continuing with clicking “Set as my store”");
  });

  it("names a labelled step by its label, with no id", async () => {
    const labelled = { ...plain, label: "Open the store list" };
    const text = await said(labelled, last, "forward");
    expect(text).toBe("Skipped “Open the store list”: the page is already past it. Continuing with step 4");
    expect(text).not.toMatch(/n\.[a-d]/u);
  });
});
