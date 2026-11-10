// A pipeline's hash: stable across key order, different for a different step.
import { describe, expect, it } from "vitest";
import { dataPipelineHash, dataPipelineSchema } from "../index.ts";

const PIPELINE = dataPipelineSchema.parse({
  name: "market.price-watch",
  source: { kind: "input", field: "queries" },
  steps: [{ id: "top", kind: "limit", count: 10 }]
});

describe("dataPipelineHash", () => {
  it("is 64 hex characters and ignores key order", async () => {
    const hash = await dataPipelineHash(PIPELINE);
    expect(hash).toMatch(/^[0-9a-f]{64}$/u);
    const reordered = dataPipelineSchema.parse({ steps: [{ count: 10, kind: "limit", id: "top" }], source: { field: "queries", kind: "input" }, name: "market.price-watch" });
    expect(await dataPipelineHash(reordered)).toBe(hash);
  });

  it("changes when a step changes", async () => {
    const other = dataPipelineSchema.parse({ ...PIPELINE, steps: [{ id: "top", kind: "limit", count: 11 }] });
    expect(await dataPipelineHash(other)).not.toBe(await dataPipelineHash(PIPELINE));
  });
});
