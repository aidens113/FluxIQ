import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_RESULT_CHECK_AUTHORIZATION_DEFAULTS, automationStudioResultCheckGrantRequestOf, grantAutomationStudioResultCheckAuthorization } from "../index.ts";

const NOW = 1_800_000_000_000;

describe("reading a request to turn result checking on", () => {
  it("asks nothing when absent, withdraws on null, and keeps the person's own limits", () => {
    expect(automationStudioResultCheckGrantRequestOf(undefined)).toBeUndefined();
    expect(automationStudioResultCheckGrantRequestOf(null)).toBeNull();
    expect(automationStudioResultCheckGrantRequestOf({ keyId: " key.one ", maxTotalCostUsd: 3, maxCostUsdPerCall: 0.2, ttlMs: 60_000, repair: { enabled: true, maxCostUsdPerRun: 0.5 } }))
      .toEqual({ keyId: "key.one", maxTotalCostUsd: 3, maxCostUsdPerCall: 0.2, ttlMs: 60_000, repair: { enabled: true, maxCostUsdPerRun: 0.5 } });
  });

  it("refuses a malformed request rather than defaulting past it", () => {
    for (const bad of ["yes", [], {}, { keyId: "" }, { keyId: "k", maxTotalCostUsd: 0 }, { keyId: "k", maxCostUsdPerCall: "1" }, { keyId: "k", ttlMs: 1.5 }, { keyId: "k", repair: true }, { keyId: "k", repair: { enabled: true, maxCostUsdPerRun: -1 } }]) {
      expect(() => automationStudioResultCheckGrantRequestOf(bad), JSON.stringify(bad)).toThrow();
    }
  });
});

describe("the stored grant", () => {
  it("records the person and how they gave it, with the documented defaults and no session", () => {
    const granted = grantAutomationStudioResultCheckAuthorization({ authorizationId: "result-check:1", userId: "user.aiden", grantedThrough: { kind: "person" }, request: { keyId: "key.one" }, nowMs: NOW });
    expect(granted).toEqual({
      taskKind: "loop_verification", authorizationId: "result-check:1", authorizedByUserId: "user.aiden", grantedThrough: { kind: "person" }, keyId: "key.one",
      maxTotalCostUsd: AUTOMATION_STUDIO_RESULT_CHECK_AUTHORIZATION_DEFAULTS.maxTotalCostUsd, maxCostUsdPerCall: AUTOMATION_STUDIO_RESULT_CHECK_AUTHORIZATION_DEFAULTS.maxCostUsdPerCall,
      grantedAtMs: NOW, expiresAtMs: NOW + AUTOMATION_STUDIO_RESULT_CHECK_AUTHORIZATION_DEFAULTS.ttlMs
    });
  });

  it("records the paired client a grant came through, and a repair clause only when switched on", () => {
    const granted = grantAutomationStudioResultCheckAuthorization({ authorizationId: "result-check:2", userId: "user.aiden", grantedThrough: { kind: "client", trustedClientId: "client.one" }, request: { keyId: "key.one", repair: { enabled: true } }, nowMs: NOW });
    expect(granted).toMatchObject({ grantedThrough: { kind: "client", trustedClientId: "client.one" }, repair: { enabled: true, maxCostUsdPerRun: AUTOMATION_STUDIO_RESULT_CHECK_AUTHORIZATION_DEFAULTS.repairMaxCostUsdPerRun } });
    expect(grantAutomationStudioResultCheckAuthorization({ authorizationId: "r", userId: "u", grantedThrough: { kind: "person" }, request: { keyId: "k", repair: { enabled: false } }, nowMs: NOW })).not.toHaveProperty("repair");
  });

  it("refuses a per-check ceiling above the whole budget", () => {
    expect(() => grantAutomationStudioResultCheckAuthorization({ authorizationId: "r", userId: "u", grantedThrough: { kind: "person" }, request: { keyId: "k", maxTotalCostUsd: 0.1, maxCostUsdPerCall: 0.2 }, nowMs: NOW })).toThrow();
  });
});
