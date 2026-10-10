import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDocument } from "../../../../model/index.ts";
import { automationStudioChildInvocation, automationStudioRootInvocation, automationStudioRunFrames } from "../index.ts";

const flow: AutomationStudioFlowDocument = { schemaVersion: "0.1", flowId: "graph.root", ownerKind: "routine", ownerId: "graph.root", name: "root", nodes: [{ id: "start", definitionId: "builtin.control.start" }], edges: [], createdAt: 1, updatedAt: 1 };

describe("the run holder", () => {
  it("carries one lifecycle state that has spent nothing, and every child frame shares it", () => {
    const holder = automationStudioRunFrames();
    expect(holder.lifecycle.ledger).toEqual({ handlerRunsForRun: 0, routesForRun: 0, incidents: {} });
    expect(holder.lifecycle.recovery).toEqual({ loaded: false });
    expect([holder.lifecycle.nextId("incident"), holder.lifecycle.nextId("incident"), holder.lifecycle.nextId("handler-execution")]).toEqual(["incident-1", "incident-2", "handler-execution-1"]);

    const root = automationStudioRootInvocation(flow, {});
    const child = automationStudioChildInvocation(root, { callNodeId: "start", subflowId: "child", graph: flow, graphRevision: null, inputs: {} })!;
    expect(child.run.lifecycle).toBe(root.run.lifecycle);
    // Two runs never share one.
    expect(automationStudioRootInvocation(flow, {}).run.lifecycle).not.toBe(root.run.lifecycle);
  });
});
