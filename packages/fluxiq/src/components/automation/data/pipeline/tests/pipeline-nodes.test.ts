import type { DataPipelineInput } from "@fluxiq/contracts/fluxnode";
import { describe, expect, it } from "vitest";
import type { JsonValue } from "../../../../../core/index.ts";
import { PIPELINE_JOIN_RIGHT_PORT, PIPELINE_SOURCE_NODE_ID, compilePipeline, runPipeline } from "../../../../../framework/automation-service/service/pipelines/index.ts";
import { builtinAutomationNodeDefinitions, getAutomationNodeDefinition } from "../../../registry.ts";

// The engine's way: each compiled node's executor in the compiler's order, on what the node before it gave.
const definition: DataPipelineInput = {
  name: "demo.nodes",
  inputs: { type: "object", properties: { items: { type: "array" } }, required: ["items"] },
  source: { kind: "input", field: "items" },
  steps: [
    { id: "keep", kind: "filter", where: { op: "gte", args: [{ field: "price" }, { value: 10 }] } },
    { id: "best", kind: "sort", by: [{ field: "price", order: "desc" }] },
    { id: "top", kind: "limit", count: 2 },
    { id: "same", kind: "join", input: "top", with: { step: "keep" }, on: [{ left: "shop", right: "shop" }], how: "inner", as: "again" }
  ]
};
const items = [{ shop: "a", price: 30 }, { shop: "b", price: 5 }, { shop: "c", price: 50 }, { shop: "d", price: 12 }];

describe("the compiled pipeline node types", () => {
  it("are registered builtin data nodes with an executor", () => {
    for (const id of ["builtin.data.pipeline-source", "builtin.data.pipeline-step"]) {
      expect(builtinAutomationNodeDefinitions.filter((node) => node.id === id)).toHaveLength(1);
      expect(typeof getAutomationNodeDefinition(id)?.execute).toBe("function");
    }
  });

  it("give, node by node, the records and lineage the direct runner gives", async () => {
    const flow = compilePipeline(definition);
    const produced = new Map<string, JsonValue>();
    for (const node of flow.nodes) {
      const edges = flow.edges.filter((edge) => edge.targetNodeId === node.id);
      const inputs: Record<string, JsonValue> = { items };
      for (const edge of edges) inputs[edge.targetPortId ?? "records"] = produced.get(edge.sourceNodeId) ?? null;
      const executed = await getAutomationNodeDefinition(node.definitionId)?.execute?.({ inputs, parameters: node.parameterValues ?? {} });
      expect(executed?.status, `${node.id}: ${executed?.message ?? ""}`).toBe("success");
      produced.set(node.id, (executed?.outputs ?? {})["records"] ?? null);
    }
    expect(flow.edges.some((edge) => edge.targetPortId === PIPELINE_JOIN_RIGHT_PORT)).toBe(true);
    const direct = await runPipeline(definition, { runId: "run-1", projectId: "project-1", pipeline: "demo.nodes", inputs: { items }, ports: {} });
    expect((produced.get(PIPELINE_SOURCE_NODE_ID) as JsonValue[]).length).toBe(items.length);
    expect((produced.get("same") as { data: JsonValue }[]).map((record) => record.data)).toEqual(direct.records.map((record) => record.data));
  });

  it("answer a step that needs a port with a failed result naming it, not a throw", async () => {
    const executed = await getAutomationNodeDefinition("builtin.data.pipeline-source")?.execute?.({ inputs: {}, parameters: { source: { kind: "dataset", dataset: { datasetId: "ds-1" } } } });
    expect(executed).toMatchObject({ status: "failed", route: "failed" });
    expect(executed?.message).toContain("no dataset reader");
  });
});
