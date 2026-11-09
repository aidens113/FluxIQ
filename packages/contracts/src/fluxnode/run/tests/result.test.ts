// Run results: four endings, none of them failed, each consistent with its parts.
import { describe, expect, it } from "vitest";
import { parseFluxNodeRunResult } from "../index.ts";

const ACHIEVED = {
  runId: "run_1",
  name: "market.cheapest-listings",
  specHash: "b".repeat(64),
  flowId: "flow_9",
  flowPath: "market/cheapest-listings",
  status: "achieved",
  outputs: { listings: [{ title: "Lens hood", price: 4.5, url: "https://market.example/1" }] },
  verdict: { label: "confirmed", by: "check" },
  path: "replayed",
  cost: { calls: 0, tokens: 0, usd: 0 },
  timings: { startedAt: 1_000, endedAt: 4_000, durationMs: 3_000 },
  lineage: [{ pointer: "/listings/0/title", runId: "run_1", stepId: "read-list", source: { kind: "read", readId: "read_3" } }],
  datasets: [{ datasetId: "ds_1", runId: "run_1", rowCount: 1 }],
  correlationId: "batch-7"
};

function codesOf(value: unknown): string[] {
  const parsed = parseFluxNodeRunResult(value);
  return parsed.ok ? [] : parsed.issues.map((issue) => `${issue.path} ${issue.code}`);
}

describe("parseFluxNodeRunResult", () => {
  it("accepts an achieved zero-call replay", () => {
    expect(codesOf(ACHIEVED)).toEqual([]);
  });

  it("has no failed status", () => {
    expect(codesOf({ ...ACHIEVED, status: "failed" })).toEqual(["/status invalid_enum_value"]);
  });

  it("refuses an achieved run with a refuted verdict", () => {
    expect(codesOf({ ...ACHIEVED, verdict: { label: "refuted", by: "check", reason: "wrong count" } })).toEqual(["/verdict run_result.achieved_refuted"]);
  });

  it("needs a resume handle exactly when budget is out or a person is needed", () => {
    expect(codesOf({ ...ACHIEVED, status: "budget_out", verdict: { label: "unverified" } })).toEqual(["/resumeHandle run_result.resume_missing"]);
    expect(codesOf({ ...ACHIEVED, status: "budget_out", verdict: { label: "unverified" }, resumeHandle: "resume_0123456789abcdef" })).toEqual([]);
    expect(codesOf({ ...ACHIEVED, resumeHandle: "resume_0123456789abcdef" })).toEqual(["/resumeHandle run_result.resume_unexpected"]);
    expect(codesOf({ ...ACHIEVED, status: "waiting_for_person", verdict: { label: "unverified" }, resumeHandle: "resume_0123456789abcdef" })).toEqual(["/waitingFor run_result.waiting_for"]);
    expect(codesOf({ ...ACHIEVED, status: "waiting_for_person", verdict: { label: "unverified" }, resumeHandle: "resume_0123456789abcdef", waitingFor: "Sign in to market.example." })).toEqual([]);
    expect(codesOf({ ...ACHIEVED, status: "stopped", verdict: { label: "unverified" } })).toEqual([]);
  });

  it("holds a verdict's by and reason to its label", () => {
    expect(codesOf({ ...ACHIEVED, verdict: { label: "confirmed" } })).toEqual(["/verdict/by verdict.by"]);
    expect(codesOf({ ...ACHIEVED, status: "stopped", verdict: { label: "unverified", by: "judge" } })).toEqual(["/verdict/by verdict.by"]);
    expect(codesOf({ ...ACHIEVED, status: "stopped", verdict: { label: "refuted", by: "type" } })).toEqual(["/verdict/reason verdict.reason_missing"]);
  });

  it("refuses times out of order, a lineage read with no step, and unknown keys", () => {
    expect(codesOf({ ...ACHIEVED, timings: { startedAt: 5, endedAt: 4, durationMs: 0 } })).toEqual(["/timings/endedAt run_result.time_order"]);
    expect(codesOf({ ...ACHIEVED, lineage: [{ pointer: "/a", runId: "run_1", source: { kind: "read", readId: "r" } }] })).toEqual(["/lineage/0/stepId lineage.step_missing"]);
    expect(codesOf({ ...ACHIEVED, lineage: [{ pointer: "/a", runId: "run_1", source: { kind: "input", pointer: "/query" } }] })).toEqual([]);
    expect(codesOf({ ...ACHIEVED, failure: "x" })).toEqual([" unrecognized_keys"]);
  });
});
