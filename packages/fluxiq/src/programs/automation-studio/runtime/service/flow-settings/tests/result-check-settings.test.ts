import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_RESULT_CHECK_DEFAULTS } from "../../../result-check-schedule/index.ts";
import { resultCheckConfigurationFromMetadata } from "../result-check-settings.ts";
import { trainingModeSettingsFromMetadata } from "../training-mode-settings.ts";

describe("result check settings read from Flow metadata", () => {
  it("gives every Flow that has never been configured the documented defaults, with no migration", () => {
    expect(trainingModeSettingsFromMetadata({}).resultCheck).toEqual({ schedule: { ...AUTOMATION_STUDIO_RESULT_CHECK_DEFAULTS } });
    expect(resultCheckConfigurationFromMetadata({}).schedule).toEqual({ ...AUTOMATION_STUDIO_RESULT_CHECK_DEFAULTS });
  });

  it("round-trips a schedule the person configured", () => {
    const settings = trainingModeSettingsFromMetadata({
      trainingModeSettings: {
        resultCheck: { schedule: { enabled: true, shape: "linear_decay", initialRunCount: 5, interval: 4, decay: 2, maxInterval: 40, repairOnRefutation: false } }
      }
    });
    expect(settings.resultCheck?.schedule).toEqual({ enabled: true, shape: "linear_decay", initialRunCount: 5, interval: 4, decay: 2, maxInterval: 40, repairOnRefutation: false });
  });

  it("floors values that would make the schedule meaningless rather than storing them", () => {
    const schedule = resultCheckConfigurationFromMetadata({ resultCheck: { schedule: { interval: 0, decay: -3, initialRunCount: -1, maxInterval: 0 } } }).schedule;
    expect(schedule).toMatchObject({ interval: 1, decay: 1, initialRunCount: 0, maxInterval: 1 });
  });

  it("reads an unrecognised shape as the default, so a newer settings file still checks", () => {
    expect(resultCheckConfigurationFromMetadata({ resultCheck: { schedule: { shape: "quarterly" } } }).schedule.shape).toBe("initial_then_exponential");
  });

  it("reads a complete standing authorization, and pins its scope whatever the record says", () => {
    const configuration = resultCheckConfigurationFromMetadata({
      resultCheck: {
        authorization: { taskKind: "runtime_patch", authorizedByUserId: "user.aiden", unlockSessionId: "session.unlock.1", keyId: "key.deepseek", maxTotalCostUsd: 1, maxCostUsdPerCall: 0.05, grantedAtMs: 10, expiresAtMs: 20 }
      }
    });
    expect(configuration.authorization).toEqual({ taskKind: "loop_verification", authorizedByUserId: "user.aiden", unlockSessionId: "session.unlock.1", keyId: "key.deepseek", maxTotalCostUsd: 1, maxCostUsdPerCall: 0.05, grantedAtMs: 10, expiresAtMs: 20 });
  });

  it("reads no authorization at all from a half-written record", () => {
    for (const broken of [
      {},
      { keyId: "key.deepseek" },
      { authorizedByUserId: "user.aiden", unlockSessionId: "s.1", keyId: "key.deepseek", maxTotalCostUsd: 1, maxCostUsdPerCall: 0.05, grantedAtMs: 10 },
      { authorizedByUserId: "user.aiden", keyId: "key.deepseek", maxTotalCostUsd: 1, maxCostUsdPerCall: 0.05, grantedAtMs: 10, expiresAtMs: 20 },
      { authorizedByUserId: "", unlockSessionId: "s.1", keyId: "key.deepseek", maxTotalCostUsd: 1, maxCostUsdPerCall: 0.05, grantedAtMs: 10, expiresAtMs: 20 }
    ]) {
      expect(resultCheckConfigurationFromMetadata({ resultCheck: { authorization: broken } }).authorization, JSON.stringify(broken)).toBeUndefined();
    }
    expect(resultCheckConfigurationFromMetadata({}).authorization).toBeUndefined();
  });
});
