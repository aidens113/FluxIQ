// A part's declared output names a node by its key (`$node.s2.value`). A repair that
// replaces the part or a node mints new node ids; the binding must still find its node,
// and a repair that would lose it is refused at the overlay.

import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDocument } from "../../../../flows/authoring/model/index.ts";
import type { AutomationStudioFlowNode } from "../../../../flows/executable/graph/index.ts";
import { automationNodeStateBinding } from "../../../../components/automation/index.ts";
import { runAutomationStudioGraph, type AutomationStudioGraphExecutionTrace } from "../../../../engine/automation/index.ts";
import type { AutomationStudioSubflowGraph } from "../../../../engine/automation/frames/index.ts";
import { overlayAutomationStudioRuntimePatch } from "../index.ts";
import { replaceAutomationStudioNodeUnit, replaceAutomationStudioPartUnit } from "../unit-replace.ts";

const CALL = "builtin.control.call-subflow";
const CONSTANT = "builtin.data.constant";

function graph(flowId: string, nodes: AutomationStudioFlowNode[], metadata?: AutomationStudioFlowDocument["metadata"]): AutomationStudioFlowDocument {
  const edges = nodes.slice(1).map((node, index) => ({ id: `${nodes[index]!.id}.${node.id}`, sourceNodeId: nodes[index]!.id, targetNodeId: node.id, sourcePortId: "success", targetPortId: "in" }));
  return { schemaVersion: "0.1", flowId, ownerKind: "routine", ownerId: flowId, name: flowId, nodes, edges, createdAt: 1, updatedAt: 1, ...(metadata ? { metadata } : {}) };
}

const PART = graph("graph.part", [
  { id: "start", definitionId: "builtin.control.start" },
  { id: "node.old.s1", definitionId: CONSTANT, parameterValues: { value: "one" }, metadata: { bootstrapSymbolicKey: "s1" } },
  { id: "node.old.s2", definitionId: CONSTANT, parameterValues: { value: "two" }, metadata: { bootstrapSymbolicKey: "s2" } }
], { parentSubflowId: "child" });

const OUTPUTS = [{ id: "answer", name: "answer", valueType: { kind: "unknown" }, metadata: { binding: automationNodeStateBinding("$node.s2.value") } }];

function artifact(outputs: readonly unknown[] = OUTPUTS) {
  return { interface: { inputs: [], outputs }, errors: [] } as unknown as NonNullable<AutomationStudioSubflowGraph["artifact"]>;
}

async function callOutputs(part: AutomationStudioFlowDocument, outputs?: readonly unknown[]): Promise<{ status: string; call: AutomationStudioGraphExecutionTrace["attempts"][number] }> {
  const calling = graph("graph.calling", [
    { id: "start", definitionId: "builtin.control.start" },
    { id: "call", definitionId: CALL, parameterValues: { subflowId: "child", outputs: { answer: "answer" } } }
  ]);
  const child: AutomationStudioSubflowGraph = { subflowId: "child", graphRevision: null, graph: part, artifact: artifact(outputs) };
  const saved = await runAutomationStudioGraph(calling, { subflowGraphs: { load: async () => child } });
  return { status: saved.status, call: saved.attempts.find((attempt) => attempt.nodeId === "call")! };
}

const steps = (key?: string) => [{ definitionId: CONSTANT, parameters: { value: "x" } }, { definitionId: CONSTANT, parameters: { value: "y" }, ...(key ? { key } : {}) }];

describe("a replaced part and its declared output binding", () => {
  it("control: the unreplaced part answers through its key", async () => {
    expect((await callOutputs(PART)).call.outputs).toEqual({ answer: "two" });
  });

  it("probe: a part replaced by keyless steps no longer answers, and the call fails instead of returning null", async () => {
    const replaced = replaceAutomationStudioPartUnit({ graph: PART, subflowId: "child", steps: steps(), runId: "r1", reason: "r" });
    expect(replaced.applied).toBe(true);
    if (!replaced.applied) return;
    const { call } = await callOutputs(replaced.graph);
    expect(call.status).toBe("failed");
    expect(call.failure?.code).toBe("executor.call_subflow.output_binding_lost");
    expect(call.message).toContain('"answer"');
    expect(call.message).toContain('"s2"');
  });

  it("a part replaced by a step that carries the key answers through it", async () => {
    const replaced = replaceAutomationStudioPartUnit({ graph: PART, subflowId: "child", steps: steps("s2"), runId: "r1", reason: "r" });
    expect(replaced.applied).toBe(true);
    if (!replaced.applied) return;
    expect(replaced.graph.nodes.at(-1)?.metadata).toMatchObject({ bootstrapSymbolicKey: "s2" });
    expect((await callOutputs(replaced.graph)).call.outputs).toEqual({ answer: "y" });
  });

  it("leaves an output whose key a node carries, but which that node did not produce, as null and not a failure", async () => {
    const unproduced = [{ id: "answer", name: "answer", valueType: { kind: "unknown" }, metadata: { binding: automationNodeStateBinding("$node.s2.nothing") } }];
    const { status, call } = await callOutputs(PART, unproduced);
    expect(status).toBe("succeeded");
    expect(call.status).toBe("succeeded");
    expect(call.outputs).toEqual({ answer: null });
  });
});

describe("a replaced node and its key", () => {
  it("keeps the key of the node whose id it keeps, and the bound output still answers", async () => {
    const replaced = replaceAutomationStudioNodeUnit({ graph: PART, nodeId: "node.old.s2", steps: [{ definitionId: CONSTANT, parameters: { value: "new" } }], runId: "r1", reason: "r" });
    expect(replaced.applied).toBe(true);
    if (!replaced.applied) return;
    expect(replaced.graph.nodes.find((node) => node.id === "node.old.s2")?.metadata).toMatchObject({ bootstrapSymbolicKey: "s2" });
    expect((await callOutputs(replaced.graph)).call.outputs).toEqual({ answer: "new" });
  });

  it("takes the key a step names instead, and refuses a key another step carries", () => {
    const renamed = replaceAutomationStudioNodeUnit({ graph: PART, nodeId: "node.old.s2", steps: [{ definitionId: CONSTANT, key: "s7" }], runId: "r1", reason: "r" });
    expect(renamed.applied && renamed.graph.nodes.find((node) => node.id === "node.old.s2")?.metadata).toMatchObject({ bootstrapSymbolicKey: "s7" });
    const clash = replaceAutomationStudioNodeUnit({ graph: PART, nodeId: "node.old.s2", steps: [{ definitionId: CONSTANT, key: "s1" }], runId: "r1", reason: "r" });
    expect(clash).toMatchObject({ applied: false, reason: "step_key_in_use:s1" });
  });
});

describe("the overlay and a declared output binding", () => {
  const DECLARED = { ...PART, interface: { inputs: [], outputs: OUTPUTS } } as typeof PART;
  const overlay = (patch: Parameters<typeof overlayAutomationStudioRuntimePatch>[0]["patch"]) => overlayAutomationStudioRuntimePatch({ flow: DECLARED, patch, failedNodeId: "node.old.s2", runId: "r1", subflowGraphs: { child: DECLARED } });
  const part = (key?: string) => ({ kind: "replace_unit" as const, reason: "r", unit: { kind: "part" as const, subflowId: "child" }, steps: steps(key) });

  it("refuses a part replacement that leaves an output without its node, naming the port and the key", () => {
    const result = overlay(part());
    expect(result).toMatchObject({ applied: false, reason: "part_output_binding_lost:child:answer" });
    if (!result.applied) expect(result.message).toContain('"s2"');
  });

  it("accepts the same replacement once a step carries the key", () => {
    expect(overlay(part("s2"))).toMatchObject({ applied: true });
  });

  it("refuses a node replacement that renames the key an output reads", () => {
    const node = { kind: "replace_unit" as const, reason: "r", unit: { kind: "node" as const, nodeId: "node.old.s2" }, steps: [{ definitionId: CONSTANT, key: "s7" }] };
    expect(overlay(node)).toMatchObject({ applied: false, reason: "part_output_binding_lost:child:answer" });
    expect(overlay({ ...node, steps: [{ definitionId: CONSTANT }] })).toMatchObject({ applied: true });
  });

  it("checks nothing when the graph carries no interface", () => {
    expect(overlayAutomationStudioRuntimePatch({ flow: PART, patch: part(), failedNodeId: "x", runId: "r1", subflowGraphs: { child: PART } })).toMatchObject({ applied: true });
  });
});
