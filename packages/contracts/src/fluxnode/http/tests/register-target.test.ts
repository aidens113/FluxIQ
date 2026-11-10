// Registering takes exactly one of a spec and a pipeline.
import { describe, expect, it } from "vitest";
import { fluxNodeRegisterSpecRequestSchema } from "../index.ts";

const SPEC = { name: "market.cheapest-listings", runtime: "web", goal: "Find listings.", start: "https://market.example/", scope: { sites: ["market.example"], acts: [] } };
const PIPELINE = { name: "market.price-watch", source: { kind: "input", field: "queries" }, steps: [{ id: "top", kind: "limit", count: 10 }] };

describe("fluxNodeRegisterSpecRequestSchema", () => {
  it("accepts a spec or a pipeline", () => {
    expect(fluxNodeRegisterSpecRequestSchema.safeParse({ spec: SPEC }).success).toBe(true);
    expect(fluxNodeRegisterSpecRequestSchema.safeParse({ pipeline: PIPELINE }).success).toBe(true);
  });

  it("refuses neither and both", () => {
    expect(fluxNodeRegisterSpecRequestSchema.safeParse({}).success).toBe(false);
    expect(fluxNodeRegisterSpecRequestSchema.safeParse({ spec: SPEC, pipeline: PIPELINE }).success).toBe(false);
  });
});
