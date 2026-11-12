import { describe, expect, it } from "vitest";
import type { JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioFlowDocument } from "../../tests/fixture-contracts.ts";
import type { AutomationStudioFlowNode } from "../../../../flows/executable/graph/index.ts";
import type { AutomationStudioGraphExecutionOptions } from "../../index.ts";
import { executeAutomationStudioNode } from "../execution.ts";
import { automationStudioRunState } from "../../state/index.ts";
import { automationStudioTraceWithholding } from "../../trace/index.ts";

type DispatchContext = Parameters<NonNullable<AutomationStudioGraphExecutionOptions["effectDispatcher"]>>[1];

function press(metadata?: Record<string, JsonValue>, parameterValues: Record<string, JsonValue> = {}): AutomationStudioFlowNode {
  return { id: "press", definitionId: "builtin.policy.action", parameterValues: { outputId: "web.dom.click", parameters: { selector: "#next" }, ...parameterValues }, ...(metadata ? { metadata } : {}) };
}

async function contextFor(node: AutomationStudioFlowNode, options: Partial<AutomationStudioGraphExecutionOptions> = {}): Promise<DispatchContext> {
  const flow: AutomationStudioFlowDocument = { schemaVersion: "0.1", flowId: "misclick", ownerKind: "routine", ownerId: "misclick", name: "Misclick", nodes: [node], edges: [], createdAt: 1, updatedAt: 1 };
  const seen: DispatchContext[] = [];
  await executeAutomationStudioNode(flow, node, {}, {
    ...options,
    effectDispatcher: (_effect, context) => {
      seen.push(context);
      return { status: "success", route: "success", outputs: {} };
    }
  }, 1, automationStudioTraceWithholding(), automationStudioRunState());
  expect(seen).toHaveLength(1);
  return seen[0];
}

const safe = { declaredConsequences: [] };

describe("the humanness misclick mark on a dispatch", () => {
  it("is set above level 0 on a node that declared no consequence and is not marked as acting", async () => {
    expect(await contextFor(press(safe), { humanness: 60 })).toEqual({ humanness: 60, humannessMisclick: true });
    expect(await contextFor(press(safe), { humanness: 1 })).toEqual({ humanness: 1, humannessMisclick: true });
  });

  it("is absent at level 0, and the context is exactly today's", async () => {
    expect(await contextFor(press(safe), { humanness: 0 })).toEqual({ humanness: 0 });
  });

  it("is absent when the run sets no humanness, so there is no context at all, as today", async () => {
    expect(await contextFor(press(safe))).toBeUndefined();
    expect(await contextFor(press(safe), { referenceNow: 5 })).toEqual({ referenceNow: 5 });
  });

  it("is absent when the node carries no declaration: absence is never read as not lasting", async () => {
    expect(await contextFor(press(), { humanness: 60 })).toEqual({ humanness: 60 });
    expect(await contextFor(press({ declaredConsequences: "none" }), { humanness: 60 })).toEqual({ humanness: 60 });
  });

  it("is absent when the node declared any consequence class", async () => {
    for (const consequence of ["modify_existing", "create_new", "move_money"]) {
      expect(await contextFor(press({ declaredConsequences: [consequence] }), { humanness: 100 })).toEqual({ humanness: 100 });
    }
  });

  it("is absent on a node marked as acting on the world, even with an empty declaration", async () => {
    for (const marks of [{ destructive: true }, { externalSideEffect: true }, { effect: "mutate" }, { requiresApproval: true }]) {
      expect(await contextFor(press({ ...safe, ...marks }), { humanness: 100 })).toEqual({ humanness: 100 });
    }
    expect(await contextFor(press(safe, { requiresApproval: true }), { humanness: 100 })).toEqual({ humanness: 100 });
    expect(await contextFor(press(safe, { effect: "mutate" }), { humanness: 100 })).toEqual({ humanness: 100 });
  });

  it("is absent when the trusted action-effect floor is anything but a read", async () => {
    for (const effectClass of ["commit", "state"] as const) {
      expect(await contextFor(press(safe), { humanness: 100, resolveActionEffect: () => ({ effectClass, permissionConsequences: [] }) })).toEqual({ humanness: 100 });
    }
    expect(await contextFor(press(safe), { humanness: 100, resolveActionEffect: () => ({ effectClass: "observe", permissionConsequences: [] }) })).toEqual({ humanness: 100, humannessMisclick: true });
  });
});
