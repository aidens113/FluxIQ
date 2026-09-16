import { describe, expect, it } from "vitest";
import {
  AUTOMATION_STUDIO_RECOVERY_TRACE_STAGES,
  buildAutomationStudioRecoveryTrace,
  type AutomationStudioRecoveryTraceEvent,
  type AutomationStudioRecoveryTraceStage
} from "../trace.ts";

// The closed stage vocabulary and its ordering rule. Sorting an out-of-order
// event into place would invent a stage that never happened, which is exactly
// what the stages exist to make impossible.
describe("buildAutomationStudioRecoveryTrace", () => {
  it("is the four stages, in order, when they are offered in order", () => {
    const trace = buildAutomationStudioRecoveryTrace(AUTOMATION_STUDIO_RECOVERY_TRACE_STAGES.map((stage) => event(stage)));

    expect(trace.schemaVersion).toBe("automation-studio.recovery-trace.v1");
    expect(trace.stages.map((entry) => entry.stage)).toEqual(["diagnosis", "recovery_plan", "exploration", "resolution"]);
    expect(trace.refused).toEqual([]);
  });

  it("is a shorter trace when the loop stopped early, not a padded one", () => {
    const trace = buildAutomationStudioRecoveryTrace([event("diagnosis"), event("recovery_plan")]);

    expect(trace.stages.map((entry) => entry.stage)).toEqual(["diagnosis", "recovery_plan"]);
    expect(trace.refused).toEqual([]);
  });

  // The mutation this is written against: allow the out-of-order event. An
  // exploration with no plan behind it is the loop acting on its own.
  it("refuses an exploration that no recovery plan preceded", () => {
    const trace = buildAutomationStudioRecoveryTrace([event("diagnosis"), event("exploration"), event("resolution")]);

    expect(trace.stages.map((entry) => entry.stage)).toEqual(["diagnosis"]);
    expect(trace.refused).toEqual([
      { stage: "exploration", code: "recovery_trace.missing_prerequisite", message: expect.stringContaining("without recovery_plan") },
      { stage: "resolution", code: "recovery_trace.missing_prerequisite", message: expect.stringContaining("without recovery_plan") }
    ]);
  });

  it("refuses a resolution that no recovery plan preceded", () => {
    const trace = buildAutomationStudioRecoveryTrace([event("diagnosis"), event("resolution")]);

    expect(trace.stages.map((entry) => entry.stage)).toEqual(["diagnosis"]);
    expect(trace.refused).toEqual([{ stage: "resolution", code: "recovery_trace.missing_prerequisite", message: expect.stringContaining("without recovery_plan") }]);
  });

  it("refuses a stage recorded after a later one, and keeps the trace it already had", () => {
    const trace = buildAutomationStudioRecoveryTrace([event("diagnosis"), event("recovery_plan"), event("resolution"), event("exploration")]);

    expect(trace.stages.map((entry) => entry.stage)).toEqual(["diagnosis", "recovery_plan", "resolution"]);
    expect(trace.refused).toEqual([{ stage: "exploration", code: "recovery_trace.stage_out_of_order", message: expect.stringContaining("after \"resolution\"") }]);
  });

  it("refuses a stage recorded twice in one recovery", () => {
    const trace = buildAutomationStudioRecoveryTrace([event("diagnosis"), event("diagnosis")]);

    expect(trace.stages).toHaveLength(1);
    expect(trace.refused).toEqual([{ stage: "diagnosis", code: "recovery_trace.stage_repeated", message: expect.stringContaining("twice") }]);
  });

  it("refuses a stage that is not one of the four", () => {
    const trace = buildAutomationStudioRecoveryTrace([event("verification" as AutomationStudioRecoveryTraceStage)]);

    expect(trace.stages).toEqual([]);
    expect(trace.refused).toEqual([{ stage: "verification", code: "recovery_trace.unknown_stage", message: expect.stringContaining("is not a recovery stage") }]);
  });

  it("returns rather than throwing, because a run that already failed must not be lost to bookkeeping", () => {
    expect(() => buildAutomationStudioRecoveryTrace([event("resolution"), event("diagnosis")])).not.toThrow();
  });
});

function event(stage: AutomationStudioRecoveryTraceStage): AutomationStudioRecoveryTraceEvent {
  return { stage, status: "completed", providerCalled: false, reason: `The ${stage} stage ran.` };
}
