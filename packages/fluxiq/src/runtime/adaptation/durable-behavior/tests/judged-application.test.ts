import { describe, expect, it } from "vitest";
import { automationStudioJudgedApplication } from "../judged-application.ts";

// `judged-application.ts`: whether a decision's runtime patch went into the Flow.

describe("the judged application a decision records", () => {
  it("reads an applied patch, and a held-back one with its reason", () => {
    expect(automationStudioJudgedApplication({ autoApply: true, applyAt: "judged_whole_run", applied: true, judgedRunId: "run.1" })).toEqual({ applied: true });
    expect(automationStudioJudgedApplication({ autoApply: true, applied: false, notAppliedReason: "refuted", error: "ignored" })).toEqual({ applied: false, notAppliedReason: "refuted" });
  });

  it("reads a patch still waiting on its judged run as unapplied with no reason", () => {
    expect(automationStudioJudgedApplication({ autoApply: true, applyAt: "judged_whole_run", applied: false })).toEqual({ applied: false });
  });

  it("reads nothing from a decision that never recorded whether it was applied", () => {
    expect(automationStudioJudgedApplication({ autoApply: false, requiresManualApproval: true })).toBeUndefined();
    expect(automationStudioJudgedApplication({ applied: "yes" })).toBeUndefined();
    expect(automationStudioJudgedApplication(undefined)).toBeUndefined();
    expect(automationStudioJudgedApplication([{ applied: true }])).toBeUndefined();
  });
});
