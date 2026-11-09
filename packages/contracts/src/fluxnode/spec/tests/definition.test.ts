// The FluxNode spec's strict parser, on the plan's own example.
import { describe, expect, it } from "vitest";
import { parseFluxNodeSpec, type FluxNodeSpecInput } from "../index.ts";

// The plan's example (FluxNode section), as the SDK would send it.
const EXAMPLE: FluxNodeSpecInput = {
  name: "market.cheapest-listings",
  runtime: "web",
  goal: "Find the {count} cheapest listings for {query} that ship to {country}.",
  start: "https://market.example/",
  inputs: {
    type: "object",
    properties: { query: { type: "string" }, country: { type: "string" }, count: { type: "integer", maximum: 10 } },
    required: ["query", "country", "count"],
    additionalProperties: false
  },
  outputs: {
    type: "object",
    properties: { listings: { type: "array", items: { type: "object", properties: { title: { type: "string" }, price: { type: "number" }, url: { type: "string", format: "uri" } }, required: ["title", "price", "url"] } } },
    required: ["listings"]
  },
  scope: { sites: ["market.example"], acts: ["read"] },
  hasCheck: true,
  options: { retries: 3, judge: "auto", budgetUsd: 0.5, model: "claude-haiku-5-5" }
};

function codesOf(value: unknown): string[] {
  const parsed = parseFluxNodeSpec(value);
  return parsed.ok ? [] : parsed.issues.map((issue) => `${issue.path} ${issue.code}`);
}

describe("parseFluxNodeSpec", () => {
  it("accepts the plan's example and drops the redundant read act", () => {
    const parsed = parseFluxNodeSpec(EXAMPLE);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value.scope).toEqual({ sites: ["market.example"], acts: [] });
  });

  it("needs only name, runtime, goal, start and scope; hasCheck defaults to false", () => {
    const parsed = parseFluxNodeSpec({ name: "notes.today", runtime: "linux", goal: "Read today's notes.", start: "gnome-text-editor", scope: { acts: [] } });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value.hasCheck).toBe(false);
  });

  it("accepts an unknown runtime id", () => {
    expect(codesOf({ name: "a", runtime: "macos", goal: "x", start: "Finder", scope: { acts: [] } })).toEqual([]);
    expect(codesOf({ name: "a", runtime: "Mac OS", goal: "x", start: "Finder", scope: { acts: [] } })).toEqual(["/runtime invalid_string"]);
  });

  it("refuses a placeholder that names no declared input, and bad braces", () => {
    expect(codesOf({ ...EXAMPLE, goal: "Find {colour} things." })).toEqual(["/goal spec.goal_undeclared_input"]);
    expect(codesOf({ ...EXAMPLE, inputs: undefined, goal: "Find {query}." })).toEqual(["/goal spec.goal_undeclared_input"]);
    expect(codesOf({ ...EXAMPLE, goal: "Find {query things." })).toEqual(["/goal spec.goal_bad_brace"]);
    expect(codesOf({ ...EXAMPLE, goal: "Literal {{braces}} and {query}." })).toEqual([]);
  });

  it("refuses inputs that are not an object type", () => {
    expect(codesOf({ ...EXAMPLE, goal: "x", inputs: { type: "array" } })).toEqual(["/inputs/type flow_interface.inputs_not_object"]);
  });

  it("refuses a web start that is not an address, or outside the scope's sites", () => {
    expect(codesOf({ ...EXAMPLE, start: "market.example" })).toEqual(["/start spec.start_not_address"]);
    expect(codesOf({ ...EXAMPLE, start: "ftp://market.example/" })).toEqual(["/start spec.start_not_address"]);
    expect(codesOf({ ...EXAMPLE, start: "https://other.example/" })).toEqual(["/start spec.start_out_of_scope"]);
    expect(codesOf({ ...EXAMPLE, start: "https://www.market.example/deals" })).toEqual([]);
    expect(codesOf({ ...EXAMPLE, scope: { acts: [] }, start: "https://anywhere.example/" })).toEqual([]);
  });

  it("refuses retries below 3, a negative budget, unknown keys and options", () => {
    expect(codesOf({ ...EXAMPLE, options: { retries: 2 } })).toEqual(["/options/retries too_small"]);
    expect(codesOf({ ...EXAMPLE, options: { budgetUsd: -1 } })).toEqual(["/options/budgetUsd too_small"]);
    expect(codesOf({ ...EXAMPLE, options: { judge: "sometimes" } })).toEqual(["/options/judge invalid_enum_value"]);
    expect(codesOf({ ...EXAMPLE, extra: 1 })).toEqual([" unrecognized_keys"]);
    expect(codesOf({ ...EXAMPLE, scope: { acts: ["purchase"] } })).toEqual(["/scope/acts/0 invalid_enum_value"]);
  });

  it("accepts a budget of 0 (replay only) and a budget above $5", () => {
    expect(codesOf({ ...EXAMPLE, options: { budgetUsd: 0 } })).toEqual([]);
    expect(codesOf({ ...EXAMPLE, options: { budgetUsd: 25 } })).toEqual([]);
  });

  it("refuses a FluxNode that uses itself, and dedupes uses", () => {
    expect(codesOf({ ...EXAMPLE, uses: ["market.cheapest-listings"] })).toEqual(["/uses spec.uses_self"]);
    const parsed = parseFluxNodeSpec({ ...EXAMPLE, uses: ["market.login", "market.login"] });
    expect(parsed.ok && parsed.value.uses).toEqual(["market.login"]);
  });

  it("never names the retired concept in an issue", () => {
    const parsed = parseFluxNodeSpec({});
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(JSON.stringify(parsed.issues).toLowerCase()).not.toContain("subflow");
  });
});
