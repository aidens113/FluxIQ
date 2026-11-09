import { describe, expect, it } from "vitest";
import { z } from "zod";
import { SdkError } from "../../errors/index.ts";
import { defineFluxNode } from "../define-fluxnode.ts";
import { isFluxNode } from "../is-fluxnode.ts";

const inputs = z.object({ query: z.string(), country: z.string(), count: z.number().int().max(10) });
const outputs = z.object({ listings: z.array(z.object({ title: z.string(), price: z.number(), url: z.string().url() })) });

function cheapestListings() {
  return defineFluxNode({
    name: "market.cheapest-listings",
    runtime: "web",
    goal: "Find the {count} cheapest listings for {query} that ship to {country}.",
    start: "https://market.example/",
    inputs,
    outputs,
    scope: { sites: ["market.example"], acts: ["read"] },
    check: ({ outputs: found, inputs: given }) => found.listings.length === given.count || "wrong number of listings",
    options: { retries: 3, judge: "auto", budgetUsd: 0.5, model: "claude-haiku-5-5" }
  });
}

describe("defineFluxNode", () => {
  it("builds the plan's sample into a spec the contracts accept", () => {
    const node = cheapestListings();
    expect(isFluxNode(node)).toBe(true);
    expect(node.spec.hasCheck).toBe(true);
    expect(node.spec.inputs?.properties?.count).toEqual({ type: "integer", maximum: 10 });
    expect(node.spec.scope).toEqual({ sites: ["market.example"], acts: [] });
  });

  it("keeps the check in this process, typed from the zod schemas", async () => {
    const node = cheapestListings();
    const verdict = await node.check?.({ outputs: { listings: [] }, inputs: { query: "x", country: "UK", count: 1 } });
    expect(verdict).toBe("wrong number of listings");
  });

  it("hashes the spec once, the same for the same declaration", async () => {
    const first = cheapestListings();
    expect(await first.hash()).toMatch(/^[0-9a-f]{64}$/u);
    expect(await first.hash()).toBe(await cheapestListings().hash());
  });

  it("says where the declaration is wrong", () => {
    const attempt = (): unknown => defineFluxNode({ name: "Bad Name", runtime: "web", goal: "Do {thing}.", start: "https://market.example/", scope: { sites: ["market.example"], acts: [] } });
    expect(attempt).toThrow(SdkError);
    expect(attempt).toThrow(/FluxNode "Bad Name" is not valid/u);
  });

  it("refuses a bare pattern in a zod type, suggesting a format", () => {
    expect(() => defineFluxNode({ name: "a.b", runtime: "web", goal: "x", start: "https://market.example/", outputs: z.object({ sku: z.string().regex(/^[A-Z]+$/u) }), scope: { acts: [] } })).toThrow(/bare "pattern".*format/su);
  });

  it("accepts raw JSON Schema and maps uses to names", () => {
    const helper = defineFluxNode({ name: "market.helper", runtime: "web", goal: "Help.", start: "https://market.example/", scope: { acts: [] } });
    const node = defineFluxNode({ name: "market.main", runtime: "web", goal: "Main.", start: "https://market.example/", outputs: { type: "object", properties: { n: { type: "integer" } }, required: ["n"] }, scope: { acts: [] }, uses: [helper, "market.other"] });
    expect(node.spec.uses).toEqual(["market.helper", "market.other"]);
    expect(node.spec.hasCheck).toBe(false);
  });
});
