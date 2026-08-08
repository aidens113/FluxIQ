import { describe, expect, it } from "vitest";
import {
  compositeNodeDefinitionId,
  createBlankAutomationStudioFlowArtifact,
  createCallFlowNode,
  createPublishedFlowSnapshot,
  getCallFlowConfiguration,
  projectPublishedFlowSnapshotToNodeDefinition,
  validateFlowComposition
} from "./index.ts";

describe("published Flow composites", () => {
  const scope = { kind: "domain" as const, domainId: "example" };
  const publishedFlow = () => ({
    ...createBlankAutomationStudioFlowArtifact({ flowId: "flow.shared", projectId: "project.shared", name: "Shared", scope, now: 1 }),
    interface: {
      inputs: [{ id: "input", name: "input", valueType: { kind: "string" as const } }],
      outputs: [{ id: "output", name: "output", valueType: { kind: "boolean" as const } }]
    }
  });

  it("projects an immutable published snapshot into a typed, scoped composite node", () => {
    const snapshot = createPublishedFlowSnapshot(publishedFlow(), "1.0.0", 20);
    const definition = projectPublishedFlowSnapshotToNodeDefinition(snapshot);
    expect(snapshot.flowDigest).toMatch(/^sha256:/);
    expect(definition).toMatchObject({
      id: compositeNodeDefinitionId({ flowId: "flow.shared", version: "1.0.0" }),
      source: { kind: "composite", flowId: "flow.shared", version: "1.0.0" },
      availability: scope
    });
    expect(definition.inputs[0]).toMatchObject({ id: "input", valueType: "string" });
  });

  it("requires an exact published version and rejects unauthorized cross-scope calls", () => {
    const target = publishedFlow();
    const snapshot = createPublishedFlowSnapshot(target, "1.0.0", 20);
    const caller = {
      ...createBlankAutomationStudioFlowArtifact({ flowId: "flow.caller", projectId: "project.caller", name: "Caller", scope, now: 1 }),
      nodes: [createCallFlowNode({ id: "call", target: { flowId: target.flowId, version: "1.0.0", scope }, inputBindings: [{ targetPortId: "input", valueKey: "message" }] })]
    };
    expect(validateFlowComposition({ flow: caller, publishedSnapshots: [snapshot] })).toEqual({ ok: true, issues: [] });
    expect(getCallFlowConfiguration(caller.nodes[0]!)).toMatchObject({ inputBindings: [{ targetPortId: "input", valueKey: "message" }] });
    const invalid = { ...caller, nodes: [createCallFlowNode({ id: "call", target: { flowId: target.flowId, version: "2.0.0", scope: { kind: "global" } } })] };
    expect(validateFlowComposition({ flow: invalid, publishedSnapshots: [snapshot] }).issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(["flow.call_target_missing"]));
  });

  it("rejects deprecated targets, missing required bindings, and unavailable child capabilities", () => {
    const target = { ...publishedFlow(), interface: { ...publishedFlow().interface, inputs: [{ id: "input", name: "input", valueType: { kind: "string" as const }, required: true }] }, regions: [{ id: "region", name: "Region", kind: "deterministic" as const, nodeIds: [], entryPorts: [], exitPorts: [], requiredRuntimeCapabilities: ["orders.execute"] }] };
    const snapshot = createPublishedFlowSnapshot(target, "1.0.0", 20);
    const caller = { ...createBlankAutomationStudioFlowArtifact({ flowId: "flow.caller", projectId: "project.caller", name: "Caller", scope, now: 1 }), nodes: [createCallFlowNode({ id: "call", target: { flowId: target.flowId, version: "1.0.0", scope } })] };
    const codes = validateFlowComposition({ flow: caller, publishedSnapshots: [snapshot], deprecatedPublicationIds: [`${target.flowId}@1.0.0`], runtimeCapabilities: [] }).issues.map((issue) => issue.code);
    expect(codes).toEqual(expect.arrayContaining(["flow.call_target_deprecated", "flow.call_required_input_unbound", "flow.call_runtime_capability_unavailable"]));
  });

  it("rejects ambiguous duplicate bindings to one child port", () => {
    const target = publishedFlow();
    const snapshot = createPublishedFlowSnapshot(target, "1.0.0", 20);
    const caller = { ...createBlankAutomationStudioFlowArtifact({ flowId: "flow.caller", projectId: "project.caller", name: "Caller", scope, now: 1 }), nodes: [createCallFlowNode({ id: "call", target: { flowId: target.flowId, version: "1.0.0", scope }, inputBindings: [{ targetPortId: "input", valueKey: "first" }, { targetPortId: "input", valueKey: "second" }] })] };
    expect(validateFlowComposition({ flow: caller, publishedSnapshots: [snapshot] }).issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "flow.call_duplicate_port_binding" })]));
  });

  it("rejects direct and indirect composite dependency cycles", () => {
    const flowA = { ...publishedFlow(), flowId: "flow.a" };
    const flowB = { ...publishedFlow(), flowId: "flow.b" };
    const snapshotA = createPublishedFlowSnapshot({ ...flowA, nodes: [createCallFlowNode({ id: "a-b", target: { flowId: "flow.b", version: "1.0.0", scope } })] }, "1.0.0", 20);
    const snapshotB = createPublishedFlowSnapshot({ ...flowB, nodes: [createCallFlowNode({ id: "b-a", target: { flowId: "flow.a", version: "1.0.0", scope } })] }, "1.0.0", 20);
    const caller = { ...flowA, nodes: [createCallFlowNode({ id: "a-b", target: { flowId: "flow.b", version: "1.0.0", scope } })] };
    expect(validateFlowComposition({ flow: caller, publishedSnapshots: [snapshotA, snapshotB] }).issues.map((issue) => issue.code)).toContain("flow.composite_cycle");
  });
});
