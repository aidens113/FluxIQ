// The spec hash: what changes it and what does not (plan, N1).
import { describe, expect, it } from "vitest";
import { canonicalFluxNodeSpec, fluxNodeSpecHash, parseFluxNodeSpec, type FluxNodeSpec, type FluxNodeSpecInput } from "../index.ts";

const BASE: FluxNodeSpecInput = {
  name: "market.cheapest-listings",
  runtime: "web",
  goal: "Find the {count} cheapest listings for {query}.",
  start: "https://market.example/",
  inputs: { type: "object", properties: { query: { type: "string" }, count: { type: "integer" } }, required: ["query", "count"] },
  outputs: { type: "array", items: { type: "string" } },
  scope: { sites: ["market.example", "cdn.market.example"], acts: ["change", "send"] }
};

function spec(changes: Partial<FluxNodeSpecInput> = {}): FluxNodeSpec {
  const parsed = parseFluxNodeSpec({ ...BASE, ...changes });
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
  return parsed.value;
}

describe("fluxNodeSpecHash", () => {
  it("is 64 lowercase hex characters and stable", async () => {
    const hash = await fluxNodeSpecHash(spec());
    expect(hash).toMatch(/^[a-f0-9]{64}$/u);
    expect(await fluxNodeSpecHash(spec())).toBe(hash);
  });

  it("ignores options, the check, uses, the name, set order and goal whitespace", async () => {
    const hash = await fluxNodeSpecHash(spec());
    expect(await fluxNodeSpecHash(spec({ options: { retries: 9, budgetUsd: 0, judge: "off", mode: "explore", model: "m", timeoutMs: 5 } }))).toBe(hash);
    expect(await fluxNodeSpecHash(spec({ hasCheck: true, uses: ["market.login"] }))).toBe(hash);
    expect(await fluxNodeSpecHash(spec({ name: "market.renamed" }))).toBe(hash);
    expect(await fluxNodeSpecHash(spec({ scope: { sites: ["cdn.market.example", "MARKET.example"], acts: ["send", "read", "change"] } }))).toBe(hash);
    expect(await fluxNodeSpecHash(spec({ goal: "  Find the {count}   cheapest listings\nfor {query}. " }))).toBe(hash);
    expect(await fluxNodeSpecHash(spec({ inputs: { type: "object", required: ["count", "query"], properties: { count: { type: "integer" }, query: { type: "string" } } } }))).toBe(hash);
  });

  it("changes when the goal, inputs, outputs, scope, runtime or start change", async () => {
    const hash = await fluxNodeSpecHash(spec());
    const changed = [
      spec({ goal: "Find the {count} dearest listings for {query}." }),
      spec({ inputs: { type: "object", properties: { query: { type: "string" }, count: { type: "number" } }, required: ["query", "count"] } }),
      spec({ outputs: { type: "array", items: { type: "number" } } }),
      spec({ outputs: undefined }),
      spec({ scope: { sites: ["market.example", "cdn.market.example"], acts: ["change"] } }),
      spec({ scope: { sites: ["market.example"], acts: ["change", "send"] } }),
      spec({ runtime: "web-next" }),
      spec({ start: "https://market.example/deals" })
    ];
    for (const other of changed) expect(await fluxNodeSpecHash(other)).not.toBe(hash);
  });
});

describe("canonicalFluxNodeSpec", () => {
  it("gives the same text for the same spec written differently, and keeps options", () => {
    const left = canonicalFluxNodeSpec(spec({ options: { retries: 4, judge: "off" } }));
    const right = canonicalFluxNodeSpec(spec({ options: { judge: "off", retries: 4 }, scope: { acts: ["send", "change"], sites: ["cdn.market.example", "market.example"] } }));
    expect(left).toBe(right);
    expect(JSON.parse(left)).toMatchObject({ name: "market.cheapest-listings", options: { retries: 4, judge: "off" }, hasCheck: false });
    expect(canonicalFluxNodeSpec(spec({ options: { retries: 5 } }))).not.toBe(left);
  });
});
