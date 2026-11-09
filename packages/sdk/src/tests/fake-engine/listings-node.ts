// The plan's sample FluxNode, shared by the client tests.

import { defineFluxNode } from "../../define/index.ts";
import { z } from "zod";

export const listingInputs = z.object({ query: z.string(), country: z.string(), count: z.number().int().max(10) });
export const listingOutputs = z.object({ listings: z.array(z.object({ title: z.string(), price: z.number(), url: z.string().url() })) });

/** `market.cheapest-listings`, with a check that wants exactly `count` listings. */
export function listingsNode() {
  return defineFluxNode({
    name: "market.cheapest-listings",
    runtime: "web",
    goal: "Find the {count} cheapest listings for {query} that ship to {country}.",
    start: "https://market.example/",
    inputs: listingInputs,
    outputs: listingOutputs,
    scope: { sites: ["market.example"], acts: ["read"] },
    check: ({ outputs, inputs }) => outputs.listings.length === inputs.count || "wrong number of listings",
    options: { retries: 3, judge: "auto", budgetUsd: 0.5 }
  });
}
