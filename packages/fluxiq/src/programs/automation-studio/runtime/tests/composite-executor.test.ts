import { describe, expect, it } from "vitest";
import { createBlankAutomationStudioFlowArtifact, createCallFlowNode, createPublishedFlowSnapshot } from "../../model/index.ts";
import { AUTOMATION_STUDIO_WITHHELD_VALUE, type AutomationStudioGraphExecutionTrace } from "../executor/index.ts";
import { runCanonicalAutomationStudioFlow } from "../index.ts";

// Obviously synthetic: every assertion about it is where it must not appear.
const SUPPLIED = "synthetic-call-flow-value-that-must-never-be-persisted";

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

  it("builds a Call Flow parent's outputs from what its child executed, while the attempt keeps the child's trace withheld", async () => {
    const number = { kind: "number" as const };
    const child = {
      ...createBlankAutomationStudioFlowArtifact({ flowId: "flow.child.defaults", projectId: "project", name: "Child with defaults", now: 1 }),
      // `left` is an output as well as an input: the child hands a run input
      // straight back, from the position its saved trace withholds.
      interface: { inputs: [{ id: "left", name: "left", valueType: number, defaultValue: 5 }, { id: "right", name: "right", valueType: number, defaultValue: 0 }], outputs: [{ id: "result", name: "result", valueType: number }, { id: "left", name: "left", valueType: number }] },
      nodes: [
        { id: "start", definitionId: "builtin.control.start" },
        { id: "sum", definitionId: "builtin.math.add", parameterValues: { precision: 0 } }
      ],
      edges: [{ id: "start.sum", sourceNodeId: "start", targetNodeId: "sum", sourcePortId: "success", targetPortId: "in" }]
    };
    const snapshot = createPublishedFlowSnapshot(child, "1.0.0", 2);
    const parent = {
      ...createBlankAutomationStudioFlowArtifact({ flowId: "flow.parent.defaults", projectId: "project", name: "Parent", now: 1 }),
      nodes: [
        { id: "start", definitionId: "builtin.control.start" },
        createCallFlowNode({ id: "call", target: { flowId: child.flowId, version: "1.0.0", scope: { kind: "global" } }, outputBindings: [{ targetPortId: "result", valueKey: "total" }, { targetPortId: "left", valueKey: "first" }] })
      ],
      edges: [{ id: "start.call", sourceNodeId: "start", targetNodeId: "call", sourcePortId: "success", targetPortId: "in" }]
    };

    const trace = await runCanonicalAutomationStudioFlow(parent, [snapshot]);

    expect(trace.status).toBe("succeeded");
    expect(trace.values.total).toBe(5);
    expect(trace.values.first).toBe(5);
    const childTrace = trace.attempts.find((attempt) => attempt.nodeId === "call")?.childTrace;
    expect(childTrace?.values).toMatchObject({ left: AUTOMATION_STUDIO_WITHHELD_VALUE, right: AUTOMATION_STUDIO_WITHHELD_VALUE, result: 5 });
    expect(childTrace?.attempts.length).toBeGreaterThan(0);
    for (const attempt of childTrace?.attempts ?? []) expect(attempt.inputs).toMatchObject({ left: AUTOMATION_STUDIO_WITHHELD_VALUE, right: AUTOMATION_STUDIO_WITHHELD_VALUE });
  });

  it("withholds from a Call Flow parent's saved trace a value its child resolved and handed back, while the parent executes with it", async () => {
    const text = { kind: "string" as const };
    const child = {
      ...createBlankAutomationStudioFlowArtifact({ flowId: "flow.child.echo", projectId: "project", name: "Child echo", now: 1 }),
      interface: { inputs: [{ id: "note", name: "note", valueType: text }], outputs: [{ id: "value", name: "value", valueType: text }] },
      nodes: [{ id: "echo", definitionId: "builtin.data.constant", parameterValues: { value: { $state: { path: "note" } } } }],
      edges: []
    };
    const snapshot = createPublishedFlowSnapshot(child, "1.0.0", 2);
    const parent = {
      ...createBlankAutomationStudioFlowArtifact({ flowId: "flow.parent.echo", projectId: "project", name: "Parent", now: 1 }),
      nodes: [createCallFlowNode({ id: "call", target: { flowId: child.flowId, version: "1.0.0", scope: { kind: "global" } }, inputBindings: [{ targetPortId: "note", valueKey: "note" }], outputBindings: [{ targetPortId: "value", valueKey: "echoed" }] })]
    };
    const executed: AutomationStudioGraphExecutionTrace[] = [];

    const trace = await runCanonicalAutomationStudioFlow(parent, [snapshot], { inputs: { note: SUPPLIED } }, [], (run) => { executed.push(run); });

    expect(trace.status).toBe("succeeded");
    expect(executed.map((run) => run.values.echoed)).toEqual([SUPPLIED]);
    expect(JSON.stringify(trace)).not.toContain(SUPPLIED);
    expect(trace.values.echoed).toBe(AUTOMATION_STUDIO_WITHHELD_VALUE);
    expect(trace.attempts.find((attempt) => attempt.nodeId === "call")?.childTrace?.values.value).toBe(AUTOMATION_STUDIO_WITHHELD_VALUE);
  });

  it("keeps a Call Flow child's variables apart from its parent's, in both directions", async () => {
    const append = { id: "remember", definitionId: "builtin.data.set-variable", parameterValues: { name: "log", writeMode: "append-list" } };
    const child = {
      ...createBlankAutomationStudioFlowArtifact({ flowId: "flow.child.variables", projectId: "project", name: "Child variables", now: 1 }),
      nodes: [
        { id: "start", definitionId: "builtin.control.start" },
        { id: "mark", definitionId: "builtin.data.constant", parameterValues: { value: "synthetic-child" } },
        append
      ],
      edges: [
        { id: "start.mark", sourceNodeId: "start", targetNodeId: "mark", sourcePortId: "success", targetPortId: "in" },
        { id: "mark.remember", sourceNodeId: "mark", targetNodeId: "remember", sourcePortId: "success", targetPortId: "in" }
      ]
    };
    const snapshot = createPublishedFlowSnapshot(child, "1.0.0", 2);
    const parent = {
      ...createBlankAutomationStudioFlowArtifact({ flowId: "flow.parent.variables", projectId: "project", name: "Parent", now: 1 }),
      nodes: [
        { id: "start", definitionId: "builtin.control.start" },
        { id: "mark", definitionId: "builtin.data.constant", parameterValues: { value: "synthetic-parent" } },
        append,
        createCallFlowNode({ id: "call", target: { flowId: child.flowId, version: "1.0.0", scope: { kind: "global" } } }),
        { id: "recall", definitionId: "builtin.data.get-variable", parameterValues: { name: "log" } }
      ],
      edges: [
        { id: "start.mark", sourceNodeId: "start", targetNodeId: "mark", sourcePortId: "success", targetPortId: "in" },
        { id: "mark.remember", sourceNodeId: "mark", targetNodeId: "remember", sourcePortId: "success", targetPortId: "in" },
        { id: "remember.call", sourceNodeId: "remember", targetNodeId: "call", sourcePortId: "success", targetPortId: "in" },
        { id: "call.recall", sourceNodeId: "call", targetNodeId: "recall", sourcePortId: "success", targetPortId: "in" }
      ]
    };

    const trace = await runCanonicalAutomationStudioFlow(parent, [snapshot], { variables: { log: ["synthetic-seed"] } });

    expect(trace.status).toBe("succeeded");
    // The child starts from the run's seed, not from what its parent wrote.
    expect(trace.attempts.find((attempt) => attempt.nodeId === "call")?.childTrace?.values["remember.next"]).toEqual(["synthetic-seed", "synthetic-child"]);
    // The parent reads back only what it wrote itself.
    expect(trace.values["recall.value"]).toEqual(["synthetic-seed", "synthetic-parent"]);
  });
});
