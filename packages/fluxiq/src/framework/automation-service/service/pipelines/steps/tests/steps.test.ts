import { dataStepSchema, type DataStep } from "@fluxiq/contracts/fluxnode";
import { describe, expect, it } from "vitest";
import { PipelineError } from "../../errors.ts";
import { PipelineRejectedError } from "../../rejected-error.ts";
import type { PipelineSdkPort } from "../../types.ts";
import { context, records, rowsOf } from "../../tests/support.ts";
import { aggregateStep, dedupeStep, filterStep, joinStep, limitStep, sortStep, transformStep, validateStep } from "../index.ts";

function step<K extends DataStep["kind"]>(kind: K, declaration: Record<string, unknown>): Extract<DataStep, { kind: K }> {
  return dataStepSchema.parse({ id: "s", kind, ...declaration }) as Extract<DataStep, { kind: K }>;
}

const listings = records([
  { id: 1, shop: "a", price: 30, title: "x" },
  { id: 2, shop: "b", price: 10, title: "y" },
  { id: 3, shop: "a", price: 20, title: "x" },
  { id: 4, shop: "b", price: null, title: "z" }
]);

describe("data steps", () => {
  it("filter keeps matching records and their lineage unchanged", () => {
    const kept = filterStep(step("filter", { where: { op: "gte", args: [{ field: "price" }, { value: 20 }] } }), listings, context());
    expect(kept.map((record) => record.data["id"])).toEqual([1, 3]);
    expect(kept[0]?.lineage).toBe(listings[0]?.lineage);
  });

  it("transform by expression adds a derived lineage entry that names the step and the input record", async () => {
    const out = await transformStep(step("transform", { expression: { object: { id: { field: "id" }, price_cents: { op: "mul", args: [{ field: "price" }, { value: 100 }] } } } }), listings, context());
    expect(rowsOf(out)[0]).toEqual({ id: 1, price_cents: 3000 });
    const last = out[2]?.lineage.at(-1);
    expect(last).toMatchObject({ pointer: "", runId: "run-1", flowId: "flow-1", stepId: "s", source: { kind: "derived", from: ["/2"] } });
    expect(out[2]?.lineage[0]?.source).toEqual({ kind: "read", readId: "read-2" });
  });

  it("transform rejects an expression that is not a record", async () => {
    await expect(transformStep(step("transform", { expression: { field: "id" } }), listings, context())).rejects.toBeInstanceOf(PipelineError);
  });

  it("transform by callback goes through the program in batches and checks the answer count", async () => {
    const batches: number[] = [];
    const sdk: PipelineSdkPort = {
      transform: async ({ records: batch }) => {
        batches.push(batch.length);
        return batch.map((row) => ({ ...row, seen: true }));
      },
      sink: async () => undefined
    };
    const out = await transformStep(step("transform", { callback: "enrich", batchSize: 3 }), listings, context({ sdk }));
    expect(batches).toEqual([3, 1]);
    expect(out[3]?.data["seen"]).toBe(true);
    const short = { transform: async () => [], sink: async () => undefined };
    await expect(transformStep(step("transform", { callback: "enrich" }), listings, context({ sdk: short }))).rejects.toMatchObject({ code: "pipeline.transform_count" });
    await expect(transformStep(step("transform", { callback: "enrich" }), listings, context())).rejects.toMatchObject({ code: "pipeline.no_sdk" });
  });

  it("dedupe keeps the first or last of each key", () => {
    expect(dedupeStep(step("dedupe", { key: ["title"] }), listings).map((record) => record.data["id"])).toEqual([1, 2, 4]);
    expect(dedupeStep(step("dedupe", { key: ["title"], keep: "last" }), listings).map((record) => record.data["id"])).toEqual([2, 3, 4]);
  });

  it("sort orders by several fields and puts null last both ways", () => {
    expect(sortStep(step("sort", { by: [{ field: "price" }] }), listings).map((record) => record.data["id"])).toEqual([2, 3, 1, 4]);
    expect(sortStep(step("sort", { by: [{ field: "price", order: "desc" }] }), listings).map((record) => record.data["id"])).toEqual([1, 3, 2, 4]);
    expect(sortStep(step("sort", { by: [{ field: "shop" }, { field: "price", order: "desc" }] }), listings).map((record) => record.data["id"])).toEqual([1, 3, 2, 4]);
  });

  it("limit takes a window", () => {
    expect(limitStep(step("limit", { count: 2, offset: 1 }), listings).map((record) => record.data["id"])).toEqual([2, 3]);
  });

  it("aggregate groups and folds, with lineage naming every member", () => {
    const out = aggregateStep(
      step("aggregate", { groupBy: ["shop"], measures: [{ name: "n", op: "count" }, { name: "total", op: "sum", field: "price" }, { name: "cheapest", op: "min", field: "price" }, { name: "titles", op: "collect", field: "title" }, { name: "kinds", op: "count_distinct", field: "title" }] }),
      listings,
      context()
    );
    expect(rowsOf(out)).toEqual([
      { shop: "a", n: 2, total: 50, cheapest: 20, titles: ["x", "x"], kinds: 1 },
      { shop: "b", n: 2, total: 10, cheapest: 10, titles: ["y", "z"], kinds: 2 }
    ]);
    expect(out[0]?.lineage.at(-1)?.source).toEqual({ kind: "derived", from: ["/0", "/2"] });
  });

  it("aggregate with no groups gives one record even for no input", () => {
    const out = aggregateStep(step("aggregate", { measures: [{ name: "n", op: "count" }, { name: "avg", op: "avg", field: "price" }] }), [], context());
    expect(rowsOf(out)).toEqual([{ n: 0, avg: null }]);
  });

  it("join matches on keys, inner drops and left keeps, and a null never matches", () => {
    const shops = records([{ code: "a", city: "Oslo" }, { code: "a", city: "Bergen" }, { code: null, city: "None" }]);
    const inner = joinStep(step("join", { with: { step: "other" }, on: [{ left: "shop", right: "code" }] }), listings, shops, context());
    expect(inner.map((record) => [record.data["id"], record.data["city"]])).toEqual([[1, "Oslo"], [1, "Bergen"], [3, "Oslo"], [3, "Bergen"]]);
    const left = joinStep(step("join", { with: { step: "other" }, on: [{ left: "shop", right: "code" }], how: "left", as: "shopInfo" }), listings, shops, context());
    expect(left).toHaveLength(6);
    expect(left[2]?.data).toEqual({ id: 2, shop: "b", price: 10, title: "y" });
    expect(left[0]?.data["shopInfo"]).toEqual({ code: "a", city: "Oslo" });
    expect(inner[0]?.lineage.map((entry) => entry.stepId)).toEqual(["source", "source", "s"]);
  });

  it("validate drops or rejects records that miss the type", () => {
    const type = { type: "object", properties: { price: { type: "number" } }, required: ["price"] };
    const dropped = validateStep(step("validate", { type, onInvalid: "drop" }), listings);
    expect(dropped.map((record) => record.data["id"])).toEqual([1, 2, 3]);
    expect(() => validateStep(step("validate", { type }), listings)).toThrow(PipelineRejectedError);
    try {
      validateStep(step("validate", { type }), listings);
    } catch (error) {
      expect((error as PipelineRejectedError).problems[0]).toMatchObject({ index: 3, path: "/price" });
    }
  });
});
