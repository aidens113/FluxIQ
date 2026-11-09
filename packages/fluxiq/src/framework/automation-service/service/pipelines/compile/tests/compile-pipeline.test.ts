import { CALL_FLOW_NODE_TYPE, type DataPipelineInput } from "@fluxiq/contracts/fluxnode";
import { describe, expect, it } from "vitest";
import { PipelineRejectedError } from "../../rejected-error.ts";
import { runPipeline } from "../../run/index.ts";
import { context, datasetPort, fakeCaller } from "../../tests/support.ts";
import { compilePipeline } from "../compile-pipeline.ts";
import { PIPELINE_NODE_TYPES, PIPELINE_SOURCE_NODE_ID } from "../node-types.ts";
import { runCompiledPipelineFlow } from "../run-compiled-flow.ts";

const definition: DataPipelineInput = {
  name: "demo.price-report",
  inputs: { type: "object", properties: { minPrice: { type: "number" }, items: { type: "array" } }, required: ["items"] },
  source: { kind: "input", field: "items" },
  steps: [
    { id: "cheap", kind: "filter", where: { op: "gte", args: [{ field: "price" }, { input: "minPrice" }] } },
    { id: "enrich", kind: "map", target: { fluxNode: "demo.double" }, inputs: { n: { field: "price" } }, concurrency: 3 },
    { id: "shops", kind: "transform", input: "enrich", expression: { object: { shop: { field: "shop" }, doubled: { field: "result.doubled" } } } },
    { id: "totals", kind: "aggregate", groupBy: ["shop"], measures: [{ name: "n", op: "count" }, { name: "sum", op: "sum", field: "doubled" }] },
    { id: "names", kind: "join", input: "totals", with: { step: "cheap" }, on: [{ left: "shop", right: "shop" }], how: "left", as: "first" },
    { id: "best", kind: "sort", by: [{ field: "sum", order: "desc" }] },
    { id: "top", kind: "limit", count: 2 },
    { id: "save", kind: "sink", to: { kind: "dataset", name: "report" } }
  ],
  outputs: { type: "object", properties: { shop: { type: "string" }, sum: { type: "number" } }, required: ["shop", "sum"] }
};

const items = [
  { shop: "a", price: 30 },
  { shop: "b", price: 10 },
  { shop: "a", price: 20 },
  { shop: "c", price: 50 },
  { shop: "b", price: 5 }
];

function ports() {
  const fake = fakeCaller();
  const store = datasetPort();
  return { fake, store, ports: { callFlow: fake.caller, writeDataset: store.write } };
}

describe("compilePipeline", () => {
  it("makes an ordinary Flow graph with a Call Flow node for the map and edges for the wiring", () => {
    const flow = compilePipeline(definition);
    expect(flow.flowId).toBe("pipeline.demo.price-report");
    expect(flow.nodes.map((node) => node.id)).toEqual([PIPELINE_SOURCE_NODE_ID, "cheap", "enrich", "shops", "totals", "names", "best", "top", "save"]);
    const map = flow.nodes.find((node) => node.id === "enrich");
    expect(map?.definitionId).toBe(CALL_FLOW_NODE_TYPE);
    expect(map?.parameterValues).toMatchObject({ target: { fluxNode: "demo.double" }, concurrency: 3, as: "result" });
    expect(flow.nodes.find((node) => node.id === "cheap")?.definitionId).toBe(PIPELINE_NODE_TYPES.step);
    expect(flow.edges.find((edge) => edge.targetNodeId === "shops")?.sourceNodeId).toBe("enrich");
    expect(flow.edges.find((edge) => edge.targetNodeId === "names" && edge.targetPortId === "right")?.sourceNodeId).toBe("cheap");
    expect(flow.metadata["interface"]).toMatchObject({ inputs: { type: "object" }, outputs: { type: "object" } });
  });

  it("refuses an invalid definition", () => {
    expect(() => compilePipeline({ ...definition, steps: [{ id: "a", kind: "limit", count: 1, input: "later" }] })).toThrow(/not valid/u);
  });

  it("gives the same records, lineage and datasets from the direct runner and from the compiled Flow", async () => {
    const direct = ports();
    const compiled = ports();
    const inputs = { minPrice: 10, items };
    const left = await runPipeline(definition, context(direct.ports, inputs));
    const right = await runCompiledPipelineFlow(compilePipeline(definition), context(compiled.ports, inputs));
    expect(left.records.length).toBeGreaterThan(0);
    expect(right.records).toEqual(left.records);
    expect(right.datasets).toEqual(left.datasets);
    expect(right.counts).toEqual(left.counts);
    expect(compiled.fake.calls).toEqual(direct.fake.calls);
    expect(compiled.store.stored).toEqual(direct.store.stored);
    expect(left.records.map((record) => record.data["shop"])).toEqual(["a", "a"]);
  });

  it("both reject records that miss the output type, the same way", async () => {
    const strict: DataPipelineInput = { ...definition, outputs: { type: "object", properties: { shop: { type: "number" } }, required: ["shop"] } };
    const inputs = { minPrice: 10, items };
    await expect(runPipeline(strict, context(ports().ports, inputs))).rejects.toBeInstanceOf(PipelineRejectedError);
    await expect(runCompiledPipelineFlow(compilePipeline(strict), context(ports().ports, inputs))).rejects.toBeInstanceOf(PipelineRejectedError);
  });

  it("both refuse inputs that do not fit the declared type", async () => {
    await expect(runPipeline(definition, context(ports().ports, { minPrice: 1 }))).rejects.toMatchObject({ code: "pipeline.bad_inputs" });
    await expect(runCompiledPipelineFlow(compilePipeline(definition), context(ports().ports, { minPrice: 1 }))).rejects.toMatchObject({ code: "pipeline.bad_inputs" });
  });
});
