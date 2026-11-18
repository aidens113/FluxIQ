import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_RESULT_CHECK_AUTHORIZATION_DEFAULTS } from "../../../../../runtime/result-verification/check-authorization/index.ts";
import { AUTOMATION_STUDIO_RESULT_CHECK_DEFAULTS } from "../../../../../runtime/result-verification/check-schedule/index.ts";
import { automationStudioStandingResultCheckGrant, resultCheckConfigurationFromMetadata } from "../result-check-settings.ts";
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
        authorization: { taskKind: "runtime_patch", authorizedByUserId: "user.aiden", authorizationId: "result-check:1", grantedThrough: { kind: "person" }, keyId: "key.deepseek", maxTotalCostUsd: 1, maxCostUsdPerCall: 0.05, grantedAtMs: 10, expiresAtMs: 20 }
      }
    });
    expect(configuration.authorization).toEqual({ taskKind: "loop_verification", authorizedByUserId: "user.aiden", authorizationId: "result-check:1", grantedThrough: { kind: "person" }, keyId: "key.deepseek", maxTotalCostUsd: 1, maxCostUsdPerCall: 0.05, grantedAtMs: 10, expiresAtMs: 20 });
  });

  it("reads a grant made through a paired client, naming that client", () => {
    const configuration = resultCheckConfigurationFromMetadata({
      resultCheck: { authorization: { authorizedByUserId: "user.aiden", authorizationId: "result-check:2", grantedThrough: { kind: "client", trustedClientId: "client.one" }, keyId: "key.deepseek", maxTotalCostUsd: 1, maxCostUsdPerCall: 0.05, grantedAtMs: 10, expiresAtMs: 20 } }
    });
    expect(configuration.authorization).toMatchObject({ authorizationId: "result-check:2", grantedThrough: { kind: "client", trustedClientId: "client.one" } });
  });

  it("reads a record stored under the old key unlock as legacy, keeping the person's own limits", () => {
    const configuration = resultCheckConfigurationFromMetadata({
      resultCheck: { authorization: { authorizedByUserId: "user.aiden", unlockSessionId: "session.unlock.1", keyId: "key.deepseek", maxTotalCostUsd: 3, maxCostUsdPerCall: 0.2, grantedAtMs: 10, expiresAtMs: 20 } }
    });
    expect(configuration.authorization).toMatchObject({ grantedThrough: { kind: "legacy_unlock" }, authorizedByUserId: "user.aiden", maxTotalCostUsd: 3, maxCostUsdPerCall: 0.2 });
    expect(configuration.authorization).not.toHaveProperty("unlockSessionId");
  });

  it("reads no authorization at all from a half-written record", () => {
    for (const broken of [
      {},
      { keyId: "key.deepseek" },
      { authorizedByUserId: "user.aiden", authorizationId: "r.1", grantedThrough: { kind: "person" }, keyId: "key.deepseek", maxTotalCostUsd: 1, maxCostUsdPerCall: 0.05, grantedAtMs: 10 },
      { authorizedByUserId: "user.aiden", authorizationId: "r.1", grantedThrough: { kind: "client" }, keyId: "key.deepseek", maxTotalCostUsd: 1, maxCostUsdPerCall: 0.05, grantedAtMs: 10, expiresAtMs: 20 },
      { authorizedByUserId: "user.aiden", authorizationId: "r.1", grantedThrough: { kind: "someone" }, keyId: "key.deepseek", maxTotalCostUsd: 1, maxCostUsdPerCall: 0.05, grantedAtMs: 10, expiresAtMs: 20 },
      { authorizedByUserId: "user.aiden", grantedThrough: { kind: "person" }, keyId: "key.deepseek", maxTotalCostUsd: 1, maxCostUsdPerCall: 0.05, grantedAtMs: 10, expiresAtMs: 20 },
      { authorizedByUserId: "user.aiden", keyId: "key.deepseek", maxTotalCostUsd: 1, maxCostUsdPerCall: 0.05, grantedAtMs: 10, expiresAtMs: 20 },
      { authorizedByUserId: "", authorizationId: "r.1", grantedThrough: { kind: "person" }, keyId: "key.deepseek", maxTotalCostUsd: 1, maxCostUsdPerCall: 0.05, grantedAtMs: 10, expiresAtMs: 20 }
    ]) {
      expect(resultCheckConfigurationFromMetadata({ resultCheck: { authorization: broken } }).authorization, JSON.stringify(broken)).toBeUndefined();
    }
    expect(resultCheckConfigurationFromMetadata({}).authorization).toBeUndefined();
  });
});

describe("the repair clause of a standing authorization", () => {
  it("reads a clause the person switched on, with the ceiling they set", () => {
    const configuration = resultCheckConfigurationFromMetadata({
      resultCheck: {
        authorization: { authorizedByUserId: "user.aiden", authorizationId: "result-check:1", grantedThrough: { kind: "person" }, keyId: "key.deepseek", maxTotalCostUsd: 1, maxCostUsdPerCall: 0.05, grantedAtMs: 10, expiresAtMs: 20, repair: { enabled: true, maxCostUsdPerRun: 0.4 } }
      }
    });
    expect(configuration.authorization?.repair).toEqual({ enabled: true, maxCostUsdPerRun: 0.4 });
  });

  it("gives a switched-on clause the documented ceiling when the person named no number", () => {
    const configuration = resultCheckConfigurationFromMetadata({
      resultCheck: {
        authorization: { authorizedByUserId: "user.aiden", authorizationId: "result-check:1", grantedThrough: { kind: "person" }, keyId: "key.deepseek", maxTotalCostUsd: 1, maxCostUsdPerCall: 0.05, grantedAtMs: 10, expiresAtMs: 20, repair: { enabled: true } }
      }
    });
    expect(configuration.authorization?.repair).toEqual({ enabled: true, maxCostUsdPerRun: AUTOMATION_STUDIO_RESULT_CHECK_AUTHORIZATION_DEFAULTS.repairMaxCostUsdPerRun });
  });

  it("reads no clause at all from anything it cannot settle, so repairing stays off", () => {
    // Off is the answer to every one of these. Turning checking on is not
    // turning repairing on, and a limit that is not a positive amount is not a
    // limit -- an authorization written before the clause existed is the first
    // case in this list and is the one every stored Flow is in.
    for (const repair of [undefined, {}, true, "yes", { enabled: false, maxCostUsdPerRun: 0.25 }, { enabled: "true", maxCostUsdPerRun: 0.25 }, { enabled: true, maxCostUsdPerRun: 0 }, { enabled: true, maxCostUsdPerRun: -1 }]) {
      const configuration = resultCheckConfigurationFromMetadata({
        resultCheck: {
          authorization: { authorizedByUserId: "user.aiden", authorizationId: "result-check:1", grantedThrough: { kind: "person" }, keyId: "key.deepseek", maxTotalCostUsd: 1, maxCostUsdPerCall: 0.05, grantedAtMs: 10, expiresAtMs: 20, ...(repair === undefined ? {} : { repair }) }
        }
      });
      expect(configuration.authorization, JSON.stringify(repair)).toBeDefined();
      expect(configuration.authorization?.repair, JSON.stringify(repair)).toBeUndefined();
    }
  });
});

describe("binding a standing key use to the grant stored on its Flow", () => {
  const stored = (authorization: Record<string, unknown>) => ({ trainingModeSettings: { resultCheck: { authorization } } });
  const grant = { authorizedByUserId: "user.aiden", authorizationId: "result-check:1", grantedThrough: { kind: "client", trustedClientId: "client.one" }, keyId: "key.deepseek", maxTotalCostUsd: 1, maxCostUsdPerCall: 0.05, grantedAtMs: 10, expiresAtMs: 1000 };
  const use = { userId: "user.aiden", authorizationId: "result-check:1", purpose: "loop_verification" };

  it("finds the live grant, with the client it was given through", () => {
    expect(automationStudioStandingResultCheckGrant(stored(grant), use, 500)).toEqual({ grantedThrough: { kind: "client", trustedClientId: "client.one" }, keyId: "key.deepseek", expiresAtMs: 1000 });
  });

  it("binds nothing for another grant, another person, an expired grant, a legacy record or no grant", () => {
    expect(automationStudioStandingResultCheckGrant(stored(grant), { ...use, authorizationId: "result-check:old" }, 500)).toBeNull();
    expect(automationStudioStandingResultCheckGrant(stored(grant), { ...use, userId: "user.other" }, 500)).toBeNull();
    expect(automationStudioStandingResultCheckGrant(stored(grant), use, 1000)).toBeNull();
    const { grantedThrough: _through, authorizationId: _id, ...legacy } = grant;
    expect(automationStudioStandingResultCheckGrant(stored({ ...legacy, unlockSessionId: "session.1" }), { ...use, authorizationId: "legacy" }, 500)).toBeNull();
    expect(automationStudioStandingResultCheckGrant({}, use, 500)).toBeNull();
  });

  it("binds a repair only where the repair clause is on", () => {
    expect(automationStudioStandingResultCheckGrant(stored(grant), { ...use, purpose: "repair" }, 500)).toBeNull();
    expect(automationStudioStandingResultCheckGrant(stored({ ...grant, repair: { enabled: true } }), { ...use, purpose: "repair" }, 500)).not.toBeNull();
    expect(automationStudioStandingResultCheckGrant(stored(grant), { ...use, purpose: "runtime_patch" }, 500)).toBeNull();
  });
});
