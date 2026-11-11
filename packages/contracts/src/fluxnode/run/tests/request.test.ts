// Run requests: one target, inputs checked against an inline spec.
import { describe, expect, it } from "vitest";
import { checkFluxNodeRunInputs, parseFluxNodeRunRequest } from "../index.ts";
import { parseFluxNodeSpec, type FluxNodeSpecInput } from "../../spec/index.ts";

const SPEC: FluxNodeSpecInput = {
  name: "market.cheapest-listings",
  runtime: "web",
  goal: "Find the {count} cheapest {query}.",
  start: "https://market.example/",
  inputs: { type: "object", properties: { query: { type: "string" }, count: { type: "integer", maximum: 10 } }, required: ["query"] },
  scope: { sites: ["market.example"], acts: [] }
};

function codesOf(value: unknown): string[] {
  const parsed = parseFluxNodeRunRequest(value);
  return parsed.ok ? [] : parsed.issues.map((issue) => `${issue.path} ${issue.code}`);
}

describe("parseFluxNodeRunRequest", () => {
  it("accepts an inline spec with fitting inputs, a name, or a resume handle", () => {
    expect(codesOf({ spec: SPEC, inputs: { query: "lens hood", count: 3 }, correlationId: "batch-7", idempotencyKey: "k1" })).toEqual([]);
    expect(codesOf({ name: "market.cheapest-listings", specHash: "a".repeat(64), inputs: { query: "x" }, options: { budgetUsd: 0 } })).toEqual([]);
    expect(codesOf({ resumeHandle: "resume_0123456789abcdef" })).toEqual([]);
    expect(codesOf({ pipeline: { name: "market.price-watch", source: { kind: "input", field: "queries" }, steps: [{ id: "top", kind: "limit", count: 10 }] }, inputs: { queries: ["a"] } })).toEqual([]);
  });

  it("refuses no target or two, a spec hash without a name, and inputs on a resume", () => {
    expect(codesOf({ inputs: {} })).toEqual([" run_request.target"]);
    expect(codesOf({ spec: SPEC, name: "a", inputs: { query: "x", count: 1 } })).toEqual([" run_request.target"]);
    expect(codesOf({ name: "a", pipeline: { name: "a", source: { kind: "input", field: "q" }, steps: [{ id: "top", kind: "limit", count: 1 }] } })).toEqual([" run_request.target"]);
    expect(codesOf({ resumeHandle: "resume_0123456789abcdef", specHash: "a".repeat(64) })).toEqual(["/specHash run_request.spec_hash_without_name"]);
    expect(codesOf({ resumeHandle: "resume_0123456789abcdef", inputs: {} })).toEqual(["/inputs run_request.inputs_on_resume"]);
  });

  it("checks inputs against an inline spec, at their pointers", () => {
    expect(codesOf({ spec: SPEC, inputs: { query: 3, count: 11 } })).toEqual(["/inputs/query inputs.type", "/inputs/count inputs.maximum"]);
    expect(codesOf({ spec: SPEC, inputs: { query: "x" } })).toEqual(["/inputs/count inputs.goal_input_missing"]);
    expect(codesOf({ spec: SPEC })).toEqual(["/inputs/query inputs.required", "/inputs/count inputs.goal_input_missing"]);
  });

  it("refuses retries below the floor in an override", () => {
    expect(codesOf({ name: "a", options: { retries: 1 } })).toEqual(["/options/retries too_small"]);
  });
});

describe("overrides and options on a resume", () => {
  it("refuses both, since a resumed run keeps its first ones, and accepts overrides on a new run", () => {
    const resume = "resume_0123456789abcdef";
    expect(codesOf({ resumeHandle: resume, overrides: { pace: { minStepGapMs: 5 } } })).toEqual(["/overrides run_request.overrides_on_resume"]);
    expect(codesOf({ resumeHandle: resume, options: { budgetUsd: 2 } })).toEqual(["/options run_request.options_on_resume"]);
    expect(codesOf({ name: "a", overrides: { pace: { minStepGapMs: 5 } } })).toEqual([]);
    expect(codesOf({ name: "a", overrides: { prompts: { "core.output_rules": { mode: "append", text: "x" } } } })).toEqual(["/overrides/prompts/core.output_rules overrides.section_locked"]);
  });
});

describe("checkFluxNodeRunInputs", () => {
  it("accepts any object when inputs are undeclared and the goal names none", () => {
    const parsed = parseFluxNodeSpec({ name: "a", runtime: "linux", goal: "List files.", start: "bash", scope: { acts: [] } });
    if (!parsed.ok) throw new Error("spec");
    expect(checkFluxNodeRunInputs(parsed.value, { anything: [1, 2] })).toEqual([]);
  });
});
