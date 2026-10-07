import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { automationStudioCandidateFingerprint as fingerprint } from "../digest.ts";
import type { AutomationStudioFlowBuildPlan } from "../../plan/index.ts";

const buildPlan = { plan: { schemaVersion: "0.1", router: { rules: [] }, subflows: [] }, risk: "low", subflows: [] } as unknown as AutomationStudioFlowBuildPlan;
const input = { projectId: "project", flowId: "flow", baseDependencyDigest: "base", instructionText: "Title\nBody", buildPlan };

it("retains the exact historical v1 fingerprint bytes", () => {
  const historical = '{"baseDependencyDigest":"base","flowId":"flow","instructionText":"Title\\nBody","plan":{"router":{"rules":[]},"schemaVersion":"0.1","subflows":[]},"projectId":"project"}';
  expect(fingerprint.candidate(input)).toBe(createHash("sha256").update(historical).digest("hex"));
  expect(fingerprint.candidate({ ...input, buildPlan: { ...buildPlan, risk: "high" } })).toBe(fingerprint.candidate(input));
});
it("v2 binds full executable derivation, source and original subject", () => {
  const bound = { ...input, originalInstructionsDigest: "a".repeat(64) }, digest = fingerprint.candidate(bound);
  expect(digest).toMatch(/^[a-f0-9]{64}$/);
  for (const changed of [{ flowId: "other" }, { projectId: "other" }, { originalInstructionsDigest: "b".repeat(64) }, { buildPlan: { ...buildPlan, risk: "high" as const } }]) expect(fingerprint.candidate({ ...bound, ...changed })).not.toBe(digest);
});
it("copies/freezes strict JSON and preserves array order while sorting object keys", () => {
  const value = { b: [1, 2], a: { text: "full\n text" } }, held = fingerprint.snapshot(value);
  value.b[0] = 8;
  expect(held).toEqual({ a: { text: "full\n text" }, b: [1, 2] });
  expect(Object.isFrozen(held.b)).toBe(true);
});
it("refuses getter/symbol/undefined/nonplain/sparse/cyclic inputs without invoking getters", () => {
  let read = false;
  const cycle: Record<string, unknown> = {}; cycle.self = cycle;
  for (const value of [{ get source() { read = true; return 1; } }, { [Symbol("authority")]: 1 }, { field: undefined }, new Date(), new Array(1), cycle]) expect(() => fingerprint.snapshot(value)).toThrow();
  expect(read).toBe(false);
});
it("refuses bytes outside the owning observation bound without trimming", () => {
  expect(() => fingerprint.snapshot({ text: "x".repeat(4 * 1024 * 1024) })).toThrow(/oversized/);
});
