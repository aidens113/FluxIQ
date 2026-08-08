import { describe, expect, it } from "vitest";
import { createBlankAutomationStudioFlowArtifact, createCallFlowNode, createPublishedFlowSnapshot } from "../model/index.ts";
import { runCanonicalAutomationStudioFlow } from "./index.ts";

describe("canonical composite Flow executor", () => {
  it("runs a pinned published child and retains its trace under the Call Flow attempt", async () => {
    const child = {
      ...createBlankAutomationStudioFlowArtifact({ flowId: "flow.child", projectId: "project", name: "Child", now: 1 }),
      interface: { inputs: [{ id: "left", name: "left", valueType: { kind: "number" as const }, defaultValue: 2 }, { id: "right", name: "right", valueType: { kind: "number" as const }, defaultValue: 3 }], outputs: [{ id: "result", name: "result", valueType: { kind: "number" as const } }] },
      nodes: [
        { id: "start", definitionId: "builtin.control.start" },
        { id: "sum", definitionId: "builtin.math.add", parameterValues: { precision: 0 } }
      ],
      edges: [{ id: "start.sum", sourceNodeId: "start", targetNodeId: "sum", sourcePortId: "success", targetPortId: "in" }]
    };
    const snapshot = createPublishedFlowSnapshot(child, "1.0.0", 2);
    const parent = {
      ...createBlankAutomationStudioFlowArtifact({ flowId: "flow.parent", projectId: "project", name: "Parent", now: 1 }),
      nodes: [
        { id: "start", definitionId: "builtin.control.start" },
        createCallFlowNode({ id: "call", target: { flowId: child.flowId, version: "1.0.0", scope: { kind: "global" } }, inputBindings: [{ targetPortId: "left", valueKey: "left" }, { targetPortId: "right", valueKey: "right" }], outputBindings: [{ targetPortId: "result", valueKey: "total" }] })
      ],
      edges: [{ id: "start.call", sourceNodeId: "start", targetNodeId: "call", sourcePortId: "success", targetPortId: "in" }]
    };
    const trace = await runCanonicalAutomationStudioFlow(parent, [snapshot], { inputs: { left: 2, right: 3 } });
    expect(trace.status).toBe("succeeded");
    expect(trace.values.result).toBe(5);
    expect(trace.values.total).toBe(5);
    expect(trace.attempts.find((attempt) => attempt.nodeId === "call")?.childTrace?.status).toBe("succeeded");
    expect(trace.attempts.find((attempt) => attempt.nodeId === "call")?.compositeTarget).toMatchObject({ flowId: "flow.child", version: "1.0.0", flowDigest: snapshot.flowDigest });
  });

  it("bounds a child by its published timeout and propagates cancellation", async () => {
    const child = { ...createBlankAutomationStudioFlowArtifact({ flowId: "flow.slow", projectId: "project", name: "Slow", now: 1 }), executionDefaults: { timeoutMs: 15 }, nodes: [{ id: "action", definitionId: "builtin.policy.action", parameterValues: { outputId: "output.slow" } }] };
    const snapshot = createPublishedFlowSnapshot(child, "1.0.0", 2);
    const parent = { ...createBlankAutomationStudioFlowArtifact({ flowId: "flow.parent.slow", projectId: "project", name: "Parent", now: 1 }), nodes: [createCallFlowNode({ id: "call", target: { flowId: child.flowId, version: "1.0.0", scope: { kind: "global" } } })] };
    let childAborted = false;
    const timeout = await runCanonicalAutomationStudioFlow(parent, [snapshot], { effectDispatcher: (_effect, context) => new Promise(() => context?.signal?.addEventListener("abort", () => { childAborted = true; }, { once: true })) });
    expect(timeout).toMatchObject({ status: "failed", attempts: [expect.objectContaining({ nodeId: "call", childTrace: expect.objectContaining({ message: "Flow execution deadline exceeded." }) })] });
    expect(childAborted).toBe(true);
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 5);
    const cancelled = await runCanonicalAutomationStudioFlow(parent, [snapshot], { signal: controller.signal, effectDispatcher: () => new Promise(() => undefined) });
    expect(cancelled.status).toBe("cancelled");
  });
});
