import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../../../model/index.ts";
import type { AutomationStudioActionEffectClass } from "../../../../nodes/index.ts";
import { runAutomationStudioGraph } from "../../index.ts";
import { automationStudioChildInvocation } from "../../frames/index.ts";
import type { AutomationStudioHostStateSnapshotRef } from "../../../host-runtime.ts";

function graph(flowId: string, node: AutomationStudioFlowNode): AutomationStudioFlowDocument {
  return { schemaVersion: "0.1", flowId, ownerKind: "routine", ownerId: flowId, name: "Effect isolation", nodes: [node], edges: [], createdAt: 1, updatedAt: 1 };
}

describe("execution-only floors in graph frames", () => {
  it("isolates nested frames with the same node id in both commit/observe directions", async () => {
    for (const outerClass of ["commit", "observe"] as const) {
      const innerClass: AutomationStudioActionEffectClass = outerClass === "commit" ? "observe" : "commit";
      const child = graph("child", { id: "same", definitionId: "example.inner", metadata: { effect: "observe", idempotent: true } });
      const parent = graph("parent", { id: "same", definitionId: "example.outer", metadata: { effect: "observe", idempotent: true } });
      let outerCalls = 0;
      let innerCalls = 0;
      const trace = await runAutomationStudioGraph(parent, {
        delay: async () => undefined,
        resolveActionEffect: (node) => ({ effectClass: node.definitionId === "example.outer" ? outerClass : innerClass, permissionConsequences: [] }),
        nativeNodeExecutor: async ({ node }) => {
          if (node.definitionId !== "example.inner") return undefined;
          innerCalls += 1;
          return { result: { status: "failed", route: "failed", outputs: {}, message: "Network error." } };
        },
        compositeExecutor: async ({ node, options }) => {
          outerCalls += 1;
          const invocation = automationStudioChildInvocation(options.invocation, { callNodeId: node.id, subflowId: null, graph: child, graphRevision: null, inputs: {} });
          await runAutomationStudioGraph(child, { ...options, ...(invocation ? { invocation } : {}) });
          throw new Error("Network error.");
        }
      });
      expect(outerCalls).toBe(outerClass === "commit" ? 1 : 4);
      expect(innerCalls).toBe(4);
      expect(trace.failure?.code).toBe(outerClass === "commit" ? "run.outcome_uncertain" : undefined);
    }
  });

  it("retains the original node floor when a region synthesizes its timeout attempt", async () => {
    let calls = 0;
    const flow = graph("timeout", { id: "same", definitionId: "builtin.policy.action", parameterValues: { outputId: "example.apply", parameters: {} }, metadata: { effect: "observe", idempotent: true } });
    const trace = await runAutomationStudioGraph(flow, {
      resolveActionEffect: () => ({ effectClass: "commit", permissionConsequences: [] }),
      effectDispatcher: () => {
        calls += 1;
        return new Promise(() => undefined);
      },
      regionRuntime: { regions: [{ id: "bounded", timeoutMs: 20 }], handoffs: [], nodeRegionIds: { same: "bounded" } },
      delay: async () => undefined
    });
    expect(calls).toBe(1);
    expect(trace.failure?.code).toBe("run.outcome_uncertain");
    expect(trace.attempts).toHaveLength(1);
    expect(trace.attempts[0]?.failure?.code).toBe("executor.region.timeout");
  });

  it("proves a preparatory timeout unacted and prevents dispatch after its snapshot arrives late", async () => {
    let release: ((value: AutomationStudioHostStateSnapshotRef) => void) | undefined;
    const before = new Promise<AutomationStudioHostStateSnapshotRef>((resolve) => { release = resolve; });
    let calls = 0;
    const flow = graph("preparation", { id: "same", definitionId: "builtin.policy.action", parameterValues: { outputId: "example.apply", parameters: {} }, metadata: { effect: "observe", idempotent: true } });
    const snapshot = { stateSnapshotId: "prepared", stateRef: "prepared", capturedAt: 1 };
    const trace = await runAutomationStudioGraph(flow, {
      resolveActionEffect: () => ({ effectClass: "commit", permissionConsequences: [] }),
      hostRuntime: { capabilities: ["state-snapshot"], captureStateSnapshot: ({ point }) => point === "before_action" ? before : snapshot },
      effectDispatcher: () => {
        calls += 1;
        return { outputs: {} };
      },
      regionRuntime: { regions: [{ id: "bounded", timeoutMs: 20 }], handoffs: [], nodeRegionIds: { same: "bounded" } },
      delay: async () => undefined
    });
    expect(calls).toBe(0);
    expect(trace.failure?.code).not.toBe("run.outcome_uncertain");
    expect(trace.attempts[0]?.failure).toMatchObject({ code: "executor.region.timeout", effect: "unacted" });
    release!(snapshot);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toBe(0);
  });
});
