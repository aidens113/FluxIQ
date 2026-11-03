// What a standing authorization will and will not pay for a Flow to repair
// itself with nobody watching.
//
// Every refusal below is a run that stays broken, so each one is a decision
// about somebody's money and each is asserted by its own code rather than by
// "it refused". The scope assertions matter most: the task kinds are returned
// and never taken, which is what stops a settings field or a caller ever
// widening this into paying to build a Flow or to judge a result.
import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_RESULT_CHECK_TASK_KIND, type AutomationStudioResultCheckAuthorization, type AutomationStudioUnattendedRepairClause } from "../contracts.ts";
import { AUTOMATION_STUDIO_UNATTENDED_REPAIR_CODES, AUTOMATION_STUDIO_UNATTENDED_REPAIR_TASK_KINDS, redeemAutomationStudioUnattendedRepairAuthorization } from "../repair.ts";

const NOW = 1_800_000_000_000;

/** `repair: undefined` is allowed on purpose: it is how a record stored before the clause existed reads back. */
type Overrides = Partial<Omit<AutomationStudioResultCheckAuthorization, "repair">> & { repair?: AutomationStudioUnattendedRepairClause | undefined };

function authorization(overrides: Overrides = {}): AutomationStudioResultCheckAuthorization {
  const { repair, ...rest }: Overrides = { repair: { enabled: true, maxCostUsdPerRun: 0.25 }, ...overrides };
  return {
    taskKind: AUTOMATION_STUDIO_RESULT_CHECK_TASK_KIND,
    authorizedByUserId: "user.aiden",
    unlockSessionId: "session.unlock.1",
    keyId: "key.deepseek",
    maxTotalCostUsd: 1,
    maxCostUsdPerCall: 0.05,
    grantedAtMs: NOW - 1000,
    expiresAtMs: NOW + 1000,
    ...rest,
    ...(repair ? { repair } : {})
  };
}

describe("redeeming a standing authorization for an unattended repair", () => {
  it("pays for the repair, naming the key, the ceiling and what the one purse has left", () => {
    const redemption = redeemAutomationStudioUnattendedRepairAuthorization({ authorization: authorization(), nowMs: NOW, spentUsd: 0.4 });

    expect(redemption).toEqual({
      redeemed: true,
      keyId: "key.deepseek",
      unlockSessionId: "session.unlock.1",
      authorizedByUserId: "user.aiden",
      taskKinds: ["runtime_diagnosis", "evidence_tool_decision", "runtime_patch"],
      maxEstimatedCostUsdPerRun: 0.25,
      remainingCostUsd: 0.6
    });
  });

  it("covers the three kinds a recovery runs, and neither building a Flow nor judging a result", () => {
    // Held here rather than in a comment, because widening this list is the one
    // edit that would turn a repair authorization into a general one.
    expect([...AUTOMATION_STUDIO_UNATTENDED_REPAIR_TASK_KINDS]).toEqual(["runtime_diagnosis", "evidence_tool_decision", "runtime_patch"]);
    expect(AUTOMATION_STUDIO_UNATTENDED_REPAIR_TASK_KINDS).not.toContain("loop_verification");
    expect(AUTOMATION_STUDIO_UNATTENDED_REPAIR_TASK_KINDS).not.toContain("flow_bootstrap");
    expect(AUTOMATION_STUDIO_UNATTENDED_REPAIR_TASK_KINDS).not.toContain("loop_plan");
  });

  it("refuses when nobody authorized anything", () => {
    const redemption = redeemAutomationStudioUnattendedRepairAuthorization({ authorization: undefined, nowMs: NOW, spentUsd: 0 });
    expect(redemption).toMatchObject({ redeemed: false, code: AUTOMATION_STUDIO_UNATTENDED_REPAIR_CODES.absent });
  });

  it("refuses when checking was authorized and repairing was not", () => {
    // The shape every authorization stored before the clause existed has.
    const redemption = redeemAutomationStudioUnattendedRepairAuthorization({ authorization: authorization({ repair: undefined }), nowMs: NOW, spentUsd: 0 });
    expect(redemption).toMatchObject({ redeemed: false, code: AUTOMATION_STUDIO_UNATTENDED_REPAIR_CODES.disabled });
  });

  it("refuses when the clause is present and switched off", () => {
    const redemption = redeemAutomationStudioUnattendedRepairAuthorization({ authorization: authorization({ repair: { enabled: false, maxCostUsdPerRun: 0.25 } }), nowMs: NOW, spentUsd: 0 });
    expect(redemption).toMatchObject({ redeemed: false, code: AUTOMATION_STUDIO_UNATTENDED_REPAIR_CODES.disabled });
  });

  it("refuses an unusable record rather than reading past it", () => {
    for (const broken of [
      authorization({ keyId: " " }),
      authorization({ unlockSessionId: "" }),
      authorization({ maxTotalCostUsd: 0 }),
      authorization({ repair: { enabled: true, maxCostUsdPerRun: 0 } })
    ]) {
      expect(redeemAutomationStudioUnattendedRepairAuthorization({ authorization: broken, nowMs: NOW, spentUsd: 0 })).toMatchObject({ redeemed: false, code: AUTOMATION_STUDIO_UNATTENDED_REPAIR_CODES.invalid });
    }
  });

  it("refuses on the same expiry that stops the checks, to the millisecond", () => {
    expect(redeemAutomationStudioUnattendedRepairAuthorization({ authorization: authorization({ expiresAtMs: NOW }), nowMs: NOW, spentUsd: 0 })).toMatchObject({ redeemed: false, code: AUTOMATION_STUDIO_UNATTENDED_REPAIR_CODES.expired });
    expect(redeemAutomationStudioUnattendedRepairAuthorization({ authorization: authorization({ expiresAtMs: NOW + 1 }), nowMs: NOW, spentUsd: 0 })).toMatchObject({ redeemed: true });
  });

  it("refuses a remainder too small to cover a whole repair, and allows one exactly big enough", () => {
    // $0.76 spent of $1 leaves $0.24 against a $0.25 repair: half a repair is
    // still billed and has changed nothing, so it is not started.
    expect(redeemAutomationStudioUnattendedRepairAuthorization({ authorization: authorization(), nowMs: NOW, spentUsd: 0.76 })).toMatchObject({ redeemed: false, code: AUTOMATION_STUDIO_UNATTENDED_REPAIR_CODES.exhausted });
    expect(redeemAutomationStudioUnattendedRepairAuthorization({ authorization: authorization(), nowMs: NOW, spentUsd: 0.75 })).toMatchObject({ redeemed: true, maxEstimatedCostUsdPerRun: 0.25, remainingCostUsd: 0.25 });
  });

  it("counts what checking has already spent, because the two draw on one purse", () => {
    // The person set one limit. A Flow that has spent it on checks has spent it.
    expect(redeemAutomationStudioUnattendedRepairAuthorization({ authorization: authorization({ maxTotalCostUsd: 0.3 }), nowMs: NOW, spentUsd: 0.2 })).toMatchObject({ redeemed: false, code: AUTOMATION_STUDIO_UNATTENDED_REPAIR_CODES.exhausted });
  });

  it("refuses rather than trimming a repair the remainder cannot cover in full", () => {
    // $3 left against a $4 repair. It is not offered $3 -- a repair funded to
    // less than it may need is one that stops halfway, billed, having changed
    // nothing. The whole clause fits or the run is not repaired.
    expect(redeemAutomationStudioUnattendedRepairAuthorization({ authorization: authorization({ maxTotalCostUsd: 10, repair: { enabled: true, maxCostUsdPerRun: 4 } }), nowMs: NOW, spentUsd: 7 })).toMatchObject({ redeemed: false, code: AUTOMATION_STUDIO_UNATTENDED_REPAIR_CODES.exhausted });
    expect(redeemAutomationStudioUnattendedRepairAuthorization({ authorization: authorization({ maxTotalCostUsd: 10, repair: { enabled: true, maxCostUsdPerRun: 4 } }), nowMs: NOW, spentUsd: 6 })).toMatchObject({ redeemed: true, maxEstimatedCostUsdPerRun: 4, remainingCostUsd: 4 });
  });

  it("treats an unreadable spend as nothing spent rather than as no limit", () => {
    const redemption = redeemAutomationStudioUnattendedRepairAuthorization({ authorization: authorization(), nowMs: NOW, spentUsd: Number.NaN });
    expect(redemption).toMatchObject({ redeemed: true, remainingCostUsd: 1 });
  });
});
