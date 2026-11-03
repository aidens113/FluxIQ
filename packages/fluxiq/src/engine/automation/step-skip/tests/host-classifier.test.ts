import { describe, expect, it } from "vitest";
import { automationStudioSkippedStepDoesAct } from "../index.ts";

describe("host interpretation of a legacy skipped step", () => {
  it("keeps an unknown action conservative without interpreting domain parameters", () => {
    expect(automationStudioSkippedStepDoesAct({ label: "Step", parameterValues: { opaque: true } })).toBe(true);
    expect(automationStudioSkippedStepDoesAct({})).toBe(false);
  });

  it("uses explicit host evidence while preserving a trusted commit floor", () => {
    const node = { label: "Step" };
    expect(automationStudioSkippedStepDoesAct(node, undefined, () => false)).toBe(false);
    expect(automationStudioSkippedStepDoesAct(node, { effectClass: "commit", permissionConsequences: [] }, () => false)).toBe(true);
    expect(automationStudioSkippedStepDoesAct(node, { effectClass: "observe", permissionConsequences: [] }, () => true)).toBe(false);
  });

  it("does not turn an unavailable host classifier into safety evidence", () => {
    expect(automationStudioSkippedStepDoesAct({ label: "Step" }, undefined, () => { throw new Error("unavailable"); })).toBe(true);
  });
});
