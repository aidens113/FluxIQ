import { describe, expect, it } from "vitest";
import { assertAutomationStudioCompiledPlan, compileAutomationStudioPlan, compiledPlanToExecutableGraph, serializeAutomationStudioCompiledPlanValue } from "../index.ts";
import { planInput } from "./fixture.ts";

describe("compiled-plan digest and graph compatibility", () => {
  it("keeps the pre-move digest, deterministic order, and revision normalization", () => {
    const plan = compileAutomationStudioPlan(planInput());
    expect(plan.planDigest).toBe("259d63b57ee5322443f563cf77519ecd0a30ecb02653767f309586ccb8cfa771");
    expect(plan.flowRevision).toBe(1);
    expect(plan.instructionRevision).toBe(2);
    expect(plan.compiledAt).toBe(1_000);
    expect(plan.startNodeId).toBe("z.start");
    expect(plan.nodes.map((node) => node.id)).toEqual(["a.end", "z.start"]);
    expect(plan.resolvedInstructions.map((instruction) => instruction.instructionId)).toEqual(["i.a", "i.z"]);
    expect(plan.dependencies.map((dependency) => dependency.id)).toEqual(["a", "z"]);
    expect(plan.edgesBySource).toEqual({ "z.start": ["edge"] });
  });

  it("accepts the exact omitted-digest and explicit-undefined digest forms", () => {
    const plan = compileAutomationStudioPlan(planInput());
    expect(() => assertAutomationStudioCompiledPlan(plan)).not.toThrow();
    expect(() => assertAutomationStudioCompiledPlan({ ...plan, planDigest: "24d70a61a98903a2d27f2786e676609bb30fb355fd72b8824cef089f090537fd" })).not.toThrow();
    expect(() => assertAutomationStudioCompiledPlan({ ...plan, flowRevision: 99 })).toThrow("digest mismatch");
  });

  it("serializes undefined plan values as null, including object keys and array slots", () => {
    expect(serializeAutomationStudioCompiledPlanValue({ absent: undefined, list: [undefined, 1] })).toBe('{"absent":null,"list":[null,1]}');
    expect(serializeAutomationStudioCompiledPlanValue(undefined)).toBe("null");
  });

  it("projects only executable graph facts while retaining host scope, metadata, and edge-port presence", () => {
    const plan = compileAutomationStudioPlan(planInput());
    const graph = compiledPlanToExecutableGraph(plan);
    expect(Object.keys(graph).sort()).toEqual(["edges", "flowId", "metadata", "nodes", "ownerId"]);
    expect(graph.ownerId).toBe("project.plan");
    expect(graph.metadata.resolvedSettings).toBe(plan.resolvedSettings);
    expect(graph.metadata.planDigest).toBe(plan.planDigest);
    expect(graph.edges[0]?.sourcePortId).toBe("");
    expect(Object.hasOwn(graph.edges[0]!, "targetPortId")).toBe(false);
    expect(graph.nodes[0]?.parameterValues).toBe(plan.nodes[0]?.parameterValues);
  });
});
