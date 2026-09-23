import { describe, expect, it } from "vitest";
import { buildFlowSettingsSavePayload, flowSettingsDraftFromFlow } from "../flow-settings-model";
import { flowResultCheckErrors, flowResultCheckSummary } from "../flow-result-check-model";

const flow = (trainingModeSettings: Record<string, unknown> = {}) =>
  ({ flowId: "flow.catalogue", name: "Catalogue", metadata: { trainingModeSettings }, interface: { inputs: [], outputs: [] } });

describe("training check settings in the Flow settings view", () => {
  it("shows a Flow nobody configured the defaults it is already running under", () => {
    const draft = flowSettingsDraftFromFlow(flow());
    expect(draft).toMatchObject({
      resultCheckEnabled: true,
      resultCheckShape: "initial_then_exponential",
      resultCheckInitialRunCount: "3",
      resultCheckInterval: "5",
      resultCheckDecay: "5",
      resultCheckMaxInterval: "",
      resultCheckRepairOnRefutation: true
    });
  });

  it("round-trips what the person configured through the save payload", () => {
    const configured = { ...flowSettingsDraftFromFlow(flow()), resultCheckShape: "linear_decay" as const, resultCheckInitialRunCount: "2", resultCheckInterval: "4", resultCheckDecay: "3", resultCheckMaxInterval: "40", resultCheckRepairOnRefutation: false };
    const saved: any = buildFlowSettingsSavePayload(flow(), configured);
    expect(saved.metadata.trainingModeSettings.resultCheck.schedule).toEqual({ enabled: true, shape: "linear_decay", initialRunCount: 2, interval: 4, decay: 3, maxInterval: 40, repairOnRefutation: false });
    expect(flowSettingsDraftFromFlow(saved)).toMatchObject({ resultCheckShape: "linear_decay", resultCheckInterval: "4", resultCheckMaxInterval: "40", resultCheckRepairOnRefutation: false });
  });

  it("never drops the standing authorization stored beside the schedule", () => {
    const authorization = { taskKind: "loop_verification", authorizedByUserId: "user.aiden", unlockSessionId: "session.1", keyId: "secret:deepseek", maxTotalCostUsd: 1, maxCostUsdPerCall: 0.05, grantedAtMs: 1, expiresAtMs: 2 };
    const existing = flow({ resultCheck: { authorization, schedule: { enabled: true, shape: "every_run", initialRunCount: 3, interval: 5, decay: 5, repairOnRefutation: true } } });
    const saved: any = buildFlowSettingsSavePayload(existing, flowSettingsDraftFromFlow(existing));
    expect(saved.metadata.trainingModeSettings.resultCheck.authorization).toEqual(authorization);
    expect(saved.metadata.trainingModeSettings.resultCheck.schedule.shape).toBe("every_run");
  });

  it("blocks a save on numbers that would make the schedule meaningless", () => {
    const base = flowSettingsDraftFromFlow(flow());
    expect(flowResultCheckErrors(base)).toEqual([]);
    expect(flowResultCheckErrors({ ...base, resultCheckInterval: "0" })).toEqual(["Checking every Nth run needs a whole number of at least 1."]);
    expect(flowResultCheckErrors({ ...base, resultCheckDecay: "0" })).toEqual(["The widening factor must be at least 1; 1 means the interval never widens."]);
    expect(flowResultCheckErrors({ ...base, resultCheckInitialRunCount: "-1" })).toEqual(["Runs checked to begin with must be a whole number, zero or more."]);
    expect(flowResultCheckErrors({ ...base, resultCheckMaxInterval: "3" })).toEqual(["The longest gap between checks cannot be shorter than the first interval."]);
    // Turned off, nothing is read, so nothing blocks turning it off.
    expect(flowResultCheckErrors({ ...base, resultCheckEnabled: false, resultCheckInterval: "0" })).toEqual([]);
  });

  it("says what the schedule will do, in runs, matching Core's own ordinals", () => {
    const base = flowSettingsDraftFromFlow(flow());
    expect(flowResultCheckSummary(base)).toBe("Runs 1, 2, 3, 8, 33, 158 and so on have their results checked.");
    expect(flowResultCheckSummary({ ...base, resultCheckShape: "linear_decay" })).toBe("Runs 1, 2, 3, 8, 18, 33 and so on have their results checked.");
    expect(flowResultCheckSummary({ ...base, resultCheckShape: "every_run" })).toBe("Every run's result is checked.");
    expect(flowResultCheckSummary({ ...base, resultCheckEnabled: false })).toContain("Results are not checked.");
    expect(flowResultCheckSummary({ ...base, resultCheckShape: "never" })).toContain("Results are not checked.");
  });

  it("says runs and never days, because nothing in Core schedules a Flow", () => {
    const base = flowSettingsDraftFromFlow(flow());
    for (const shape of ["initial_then_exponential", "linear_decay", "fixed_interval", "every_run", "never"] as const) {
      const summary = flowResultCheckSummary({ ...base, resultCheckShape: shape });
      expect(summary, shape).not.toMatch(/\b(day|days|week|weeks|month|months|hour|hours)\b/);
    }
  });
});
