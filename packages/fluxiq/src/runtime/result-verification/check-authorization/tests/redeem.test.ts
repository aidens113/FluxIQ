import { describe, expect, it } from "vitest";
import {
  AUTOMATION_STUDIO_RESULT_CHECK_AUTHORIZATION_CODES,
  AUTOMATION_STUDIO_RESULT_CHECK_AUTHORIZATION_DEFAULTS,
  redeemAutomationStudioResultCheckAuthorization,
  type AutomationStudioResultCheckAuthorization
} from "../index.ts";

const NOW = 1_700_000_000_000;

const authorization = (overrides: Partial<AutomationStudioResultCheckAuthorization> = {}): AutomationStudioResultCheckAuthorization => ({
  taskKind: "loop_verification",
  authorizedByUserId: "user.aiden",
  unlockSessionId: "session.unlock.1",
  keyId: "key.deepseek",
  maxTotalCostUsd: AUTOMATION_STUDIO_RESULT_CHECK_AUTHORIZATION_DEFAULTS.maxTotalCostUsd,
  maxCostUsdPerCall: AUTOMATION_STUDIO_RESULT_CHECK_AUTHORIZATION_DEFAULTS.maxCostUsdPerCall,
  grantedAtMs: NOW - 1000,
  expiresAtMs: NOW + AUTOMATION_STUDIO_RESULT_CHECK_AUTHORIZATION_DEFAULTS.ttlMs,
  ...overrides
});

describe("standing result-check authorization", () => {
  it("lets an unattended run obtain a model, with no actor session anywhere in the call", () => {
    const redemption = redeemAutomationStudioResultCheckAuthorization({ authorization: authorization(), taskKind: "loop_verification", nowMs: NOW, spentUsd: 0 });
    expect(redemption).toEqual({ redeemed: true, keyId: "key.deepseek", unlockSessionId: "session.unlock.1", authorizedByUserId: "user.aiden", maxEstimatedCostUsd: 0.05, remainingCostUsd: 1 });
  });

  it("refuses an expired authorization", () => {
    const redemption = redeemAutomationStudioResultCheckAuthorization({ authorization: authorization({ expiresAtMs: NOW - 1 }), taskKind: "loop_verification", nowMs: NOW, spentUsd: 0 });
    expect(redemption).toMatchObject({ redeemed: false, code: AUTOMATION_STUDIO_RESULT_CHECK_AUTHORIZATION_CODES.expired });
  });

  it("refuses an exhausted authorization, and counts a remainder too small for one call as exhausted", () => {
    const spentOut = redeemAutomationStudioResultCheckAuthorization({ authorization: authorization(), taskKind: "loop_verification", nowMs: NOW, spentUsd: 1 });
    expect(spentOut).toMatchObject({ redeemed: false, code: AUTOMATION_STUDIO_RESULT_CHECK_AUTHORIZATION_CODES.exhausted });
    const nearlyOut = redeemAutomationStudioResultCheckAuthorization({ authorization: authorization(), taskKind: "loop_verification", nowMs: NOW, spentUsd: 0.98 });
    expect(nearlyOut).toMatchObject({ redeemed: false, code: AUTOMATION_STUDIO_RESULT_CHECK_AUTHORIZATION_CODES.exhausted });
    const lastCall = redeemAutomationStudioResultCheckAuthorization({ authorization: authorization(), taskKind: "loop_verification", nowMs: NOW, spentUsd: 0.95 });
    expect(lastCall).toMatchObject({ redeemed: true, maxEstimatedCostUsd: 0.05 });
  });

  it("cannot be redeemed for anything but judging a finished run's result", () => {
    for (const taskKind of ["runtime_diagnosis", "runtime_patch", "evidence_tool_decision", "loop_plan", "flow_bootstrap", "change_proposal_generation", ""]) {
      const redemption = redeemAutomationStudioResultCheckAuthorization({ authorization: authorization(), taskKind, nowMs: NOW, spentUsd: 0 });
      expect(redemption, taskKind).toMatchObject({ redeemed: false, code: AUTOMATION_STUDIO_RESULT_CHECK_AUTHORIZATION_CODES.scope });
    }
  });

  it("refuses a record that claims a wider scope than the one it may carry", () => {
    const widened = { ...authorization(), taskKind: "runtime_patch" } as unknown as AutomationStudioResultCheckAuthorization;
    const redemption = redeemAutomationStudioResultCheckAuthorization({ authorization: widened, taskKind: "loop_verification", nowMs: NOW, spentUsd: 0 });
    expect(redemption).toMatchObject({ redeemed: false, code: AUTOMATION_STUDIO_RESULT_CHECK_AUTHORIZATION_CODES.scope });
  });

  it("refuses when nobody authorized checking, and when the stored record is unusable", () => {
    expect(redeemAutomationStudioResultCheckAuthorization({ authorization: undefined, taskKind: "loop_verification", nowMs: NOW, spentUsd: 0 }))
      .toMatchObject({ redeemed: false, code: AUTOMATION_STUDIO_RESULT_CHECK_AUTHORIZATION_CODES.absent });
    for (const broken of [{ keyId: "  " }, { unlockSessionId: "" }, { maxTotalCostUsd: 0 }, { maxCostUsdPerCall: -1 }, { maxTotalCostUsd: Number.NaN }]) {
      expect(redeemAutomationStudioResultCheckAuthorization({ authorization: authorization(broken), taskKind: "loop_verification", nowMs: NOW, spentUsd: 0 }))
        .toMatchObject({ redeemed: false, code: AUTOMATION_STUDIO_RESULT_CHECK_AUTHORIZATION_CODES.invalid });
    }
  });

  it("never returns a per-call ceiling above what the authorization has left", () => {
    const redemption = redeemAutomationStudioResultCheckAuthorization({ authorization: authorization({ maxTotalCostUsd: 0.04, maxCostUsdPerCall: 0.05 }), taskKind: "loop_verification", nowMs: NOW, spentUsd: 0 });
    expect(redemption).toMatchObject({ redeemed: false, code: AUTOMATION_STUDIO_RESULT_CHECK_AUTHORIZATION_CODES.exhausted });
  });
});
