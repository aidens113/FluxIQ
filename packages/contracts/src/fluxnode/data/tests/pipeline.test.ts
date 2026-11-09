// Pipelines and their data steps: every step kind, defaults, and the references
// between steps.
import { describe, expect, it } from "vitest";
import { dataStepSchema, parseDataPipeline, type DataPipelineInput } from "../index.ts";

const PIPELINE: DataPipelineInput = {
  name: "market.price-watch",
  inputs: { type: "object", properties: { queries: { type: "array", items: { type: "string" } } }, required: ["queries"] },
  source: { kind: "input", field: "queries" },
  steps: [
    { id: "search", kind: "map", target: { fluxNode: "market.cheapest-listings" }, inputs: { query: { op: "to_text", args: [{ input: "queries" }] } }, concurrency: 4, skipProcessedBy: ["query"], reuseResultsForMs: 3_600_000 },
    { id: "cheap", kind: "filter", where: { op: "lt", args: [{ field: "result.price" }, { value: 20 }] } },
    { id: "shape", kind: "transform", expression: { object: { title: { field: "result.title" }, price: { field: "result.price" } } } },
    { id: "enrich", kind: "transform", callback: "enrichListing", batchSize: 50 },
    { id: "unique", kind: "dedupe", key: ["title"] },
    { id: "sellers", kind: "join", with: { dataset: { datasetId: "ds_sellers" } }, on: [{ left: "seller", right: "name" }], how: "left", as: "sellerInfo" },
    { id: "ordered", kind: "sort", by: [{ field: "price" }] },
    { id: "top", kind: "limit", count: 10 },
    { id: "totals", kind: "aggregate", input: "top", groupBy: ["seller"], measures: [{ name: "n", op: "count" }, { name: "avgPrice", op: "avg", field: "price" }] },
    { id: "checked", kind: "validate", input: "top", type: { type: "object", properties: { price: { type: "number" } }, required: ["price"] } },
    { id: "save", kind: "sink", to: { kind: "file", format: "csv", path: "exports/price-watch.csv" } },
    { id: "notify", kind: "sink", input: "totals", to: { kind: "webhook", url: "https://hooks.example/price" } }
  ]
};

function codesOf(value: unknown): string[] {
  const parsed = parseDataPipeline(value);
  return parsed.ok ? [] : parsed.issues.map((issue) => `${issue.path} ${issue.code}`);
}

describe("parseDataPipeline", () => {
  it("accepts every step kind", () => {
    expect(codesOf(PIPELINE)).toEqual([]);
  });

  it("fills defaults", () => {
    const parsed = parseDataPipeline({ name: "a", source: { kind: "dataset", dataset: { datasetId: "d" } }, steps: [{ id: "m", kind: "map", target: { flowId: "f" }, inputs: {} }, { id: "d", kind: "dedupe", key: ["x"] }] });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.steps[0]).toMatchObject({ as: "result", concurrency: 1 });
    expect(parsed.value.steps[1]).toMatchObject({ keep: "first" });
  });

  it("refuses an empty field path list at its pointer", () => {
    const broken = structuredClone(PIPELINE);
    const first = broken.steps[0];
    if (first?.kind === "map") first.inputs = { query: { field: [] } };
    expect(codesOf(broken)).toEqual(["/steps/0/inputs/query/field expression.bad_field"]);
  });

  it("refuses a reference to a later or unknown step, and a repeated id", () => {
    const base = { name: "a", source: { kind: "input", field: "rows" } };
    expect(codesOf({ ...base, steps: [{ id: "a", kind: "limit", count: 1, input: "b" }, { id: "b", kind: "limit", count: 1 }] })).toEqual(["/steps/0/input pipeline.unknown_step"]);
    expect(codesOf({ ...base, steps: [{ id: "a", kind: "join", with: { step: "a" }, on: [{ left: "x", right: "x" }] }] })).toEqual(["/steps/0/with/step pipeline.unknown_step"]);
    expect(codesOf({ ...base, steps: [{ id: "a", kind: "limit", count: 1 }, { id: "a", kind: "limit", count: 2 }] })).toEqual(["/steps/1/id pipeline.duplicate_step"]);
    expect(codesOf({ ...base, steps: [] })).toEqual(["/steps too_small"]);
  });
});

describe("dataStepSchema", () => {
  it("holds a transform to exactly one form and batchSize to callbacks", () => {
    expect(dataStepSchema.safeParse({ id: "t", kind: "transform" }).success).toBe(false);
    expect(dataStepSchema.safeParse({ id: "t", kind: "transform", expression: { field: "a" }, callback: "f" }).success).toBe(false);
    expect(dataStepSchema.safeParse({ id: "t", kind: "transform", expression: { field: "a" }, batchSize: 5 }).success).toBe(false);
  });

  it("holds a measure's field to its operation", () => {
    expect(dataStepSchema.safeParse({ id: "g", kind: "aggregate", measures: [{ name: "n", op: "count", field: "x" }] }).success).toBe(false);
    expect(dataStepSchema.safeParse({ id: "g", kind: "aggregate", measures: [{ name: "s", op: "sum" }] }).success).toBe(false);
  });

  it("refuses unsafe sinks: a path out of the export folder, an http webhook elsewhere, credentials in the address", () => {
    const sink = (to: unknown): boolean => dataStepSchema.safeParse({ id: "s", kind: "sink", to }).success;
    expect(sink({ kind: "file", format: "json", path: "../secrets.json" })).toBe(false);
    expect(sink({ kind: "file", format: "json", path: "/etc/x.json" })).toBe(false);
    expect(sink({ kind: "file", format: "json", path: "a/../../x.json" })).toBe(false);
    expect(sink({ kind: "webhook", url: "http://hooks.example/x" })).toBe(false);
    expect(sink({ kind: "webhook", url: "http://localhost:8080/x" })).toBe(true);
    expect(sink({ kind: "webhook", url: "https://user:pass@hooks.example/x" })).toBe(false);
    expect(sink({ kind: "sdk", callback: "saveRows" })).toBe(true);
    expect(sink({ kind: "dataset", name: "Watched prices" })).toBe(true);
  });
});
