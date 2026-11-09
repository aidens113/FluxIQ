import { parseDataPipeline } from "@fluxiq/contracts/fluxnode";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineFluxNode } from "../../define/index.ts";
import { SdkError } from "../../errors/index.ts";
import { pipeline } from "../pipeline.ts";

const lookup = defineFluxNode({ name: "market.lookup", runtime: "web", goal: "Look up {sku}.", start: "https://market.example/", inputs: z.object({ sku: z.string() }), scope: { sites: ["market.example"], acts: [] } });

describe("pipeline()", () => {
  it("builds a definition the contracts' parser accepts, with defaults filled", () => {
    const built = pipeline("market.price-report", { inputs: z.object({ skus: z.array(z.object({ sku: z.string() })) }) })
      .fromInput("skus")
      .map(lookup, { inputs: { sku: { field: "sku" } }, concurrency: 4 })
      .filter({ op: "exists", args: [{ field: "result" }] })
      .dedupe(["sku"])
      .sort([{ field: "sku" }])
      .limit(10)
      .validate({ type: "object", properties: { sku: { type: "string" } }, required: ["sku"] })
      .sink({ kind: "file", format: "csv", path: "exports/report.csv" })
      .build();
    expect(parseDataPipeline(built.definition).ok).toBe(true);
    expect(built.definition.steps.map((step) => step.id)).toEqual(["map-1", "filter-2", "dedupe-3", "sort-4", "limit-5", "validate-6", "sink-7"]);
    expect(built.definition.steps[0]).toMatchObject({ kind: "map", target: { fluxNode: "market.lookup" }, as: "result", concurrency: 4 });
    expect(built.definition.source).toEqual({ kind: "input", field: "skus" });
  });

  it("registers function transforms and sinks as callbacks the definition names", async () => {
    const seen: unknown[] = [];
    const built = pipeline("market.report").fromDataset("listings").transform({ fn: (records) => records.map((record) => ({ ...record, seen: true })), batchSize: 50 }).sink((records) => void seen.push(records.length)).build();
    expect(built.definition.steps).toMatchObject([
      { kind: "transform", callback: "transform1", batchSize: 50 },
      { kind: "sink", to: { kind: "sdk", callback: "sink2" } }
    ]);
    expect(Object.keys(built.callbacks)).toEqual(["transform1", "sink2"]);
    expect(await built.callbacks.transform1?.([{ a: 1 }])).toEqual([{ a: 1, seen: true }]);
    expect(await built.callbacks.sink2?.([{ a: 1 }, { a: 2 }])).toEqual([{ a: 1 }, { a: 2 }]);
    expect(seen).toEqual([2]);
  });

  it("says what is wrong when the contracts refuse the pipeline", () => {
    const attempt = (): unknown => pipeline("market.bad").fromDataset("x").dedupe(["a"], { input: "nope" }).build();
    expect(attempt).toThrow(SdkError);
    expect(attempt).toThrow(/"nope" is not an earlier step/u);
  });

  it("calls a FluxNode by name or a Flow by id", () => {
    const built = pipeline("market.mixed").fromFlow("market.lookup", { sku: { value: "a" } }).map({ flowId: "flow_9" }, { inputs: {} }).build();
    expect(built.definition.source).toMatchObject({ kind: "flow", target: { fluxNode: "market.lookup" } });
    expect(built.definition.steps[0]).toMatchObject({ target: { flowId: "flow_9" } });
  });
});
