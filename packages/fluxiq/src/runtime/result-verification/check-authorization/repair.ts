// Whether a standing authorization may pay for this Flow to repair itself with
// nobody watching, and for how much.
//
// Pure, and the whole of the protection, exactly as `redeem.ts` is for a check.
// Every refusal is fail-closed: anything not positively recognised as switched
// on, within the expiry and within the ceiling is refused, the run records the
// refusal's own code, and it finishes as the failed run it already was rather
// than waiting for anybody.
//
// **The scope is not an argument.** `AUTOMATION_STUDIO_UNATTENDED_REPAIR_TASK_KINDS`
// is returned, never taken. There is no parameter, no settings field and no
// caller by which a standing authorization could come to pay for building a
// Flow, for a bootstrap exploration, or for judging a result -- that last one
// belongs to `redeem.ts`, on its own per-call ceiling, and the two are counted
// against one purse rather than two.
//
// **What it is not.** It is not permission to act. The resolution this funds
// carries no `permittedConsequences`, so a repair that wants to press something
// with a lasting consequence meets the recovery's permission gate with nothing
// granted and raises a request for the person. Paying for the model and
// allowing the act are different permissions and this is only the first.

import type { AutomationStudioResultCheckAuthorization } from "./contracts.ts";

/**
 * The task kinds an unattended repair may be redeemed for, and the only ones.
 *
 * Exactly what `recovery/annotation/` runs and nothing beside it: the diagnosis
 * that reads the failure, the evidence decisions an exploration makes, and the
 * patch. Not `loop_plan` and not `flow_bootstrap`, so this cannot pay to build
 * a Flow; not `loop_verification`, which is the check's own redemption.
 */
export const AUTOMATION_STUDIO_UNATTENDED_REPAIR_TASK_KINDS: readonly string[] = Object.freeze([
  "runtime_diagnosis",
  "evidence_tool_decision",
  "runtime_patch"
]);

/** Why an unattended repair was not funded. One code per reason, so a reader can act on it. */
export const AUTOMATION_STUDIO_UNATTENDED_REPAIR_CODES = Object.freeze({
  /** No standing authorization is stored for this Flow: nobody has authorized anything. */
  absent: "core.repair.authorization_absent",
  /** An authorization is stored and its repair clause is absent or switched off. */
  disabled: "core.repair.authorization_disabled",
  /** The clause is stored but unusable -- no key, or a ceiling that is not a positive amount. */
  invalid: "core.repair.authorization_invalid",
  /** The authorization has lapsed and the person must renew it. */
  expired: "core.repair.authorization_expired",
  /** The cost ceiling the person set has been reached, counting what checking has spent too. */
  exhausted: "core.repair.authorization_exhausted"
});

/** What redeeming the repair clause produced: a bounded provider request, or the stated reason there is none. */
export type AutomationStudioUnattendedRepairRedemption =
  | {
    redeemed: true;
    keyId: string;
    /** The key unlock to draw the credential from, and the user it must belong to. Checked together by the host. */
    unlockSessionId: string;
    authorizedByUserId: string;
    /** The kinds this redemption covers. Returned so the caller can hold the provider to them, never supplied. */
    taskKinds: readonly string[];
    /** The narrower of the clause's per-repair ceiling and what the one purse has left. */
    maxEstimatedCostUsdPerRun: number;
    /** What the authorization has left after the spend already recorded against it. */
    remainingCostUsd: number;
  }
  | {
    redeemed: false;
    /** The stable code recorded on the run, so an unrepaired run says why rather than being silent. */
    code: string;
    reason: string;
  };

export function redeemAutomationStudioUnattendedRepairAuthorization(input: {
  authorization: AutomationStudioResultCheckAuthorization | undefined;
  nowMs: number;
  /** What has already been spent against this authorization, from the Flow's own run history. The same tally the checks draw down. */
  spentUsd: number;
}): AutomationStudioUnattendedRepairRedemption {
  const authorization = input.authorization;
  if (!authorization) {
    return refusal(AUTOMATION_STUDIO_UNATTENDED_REPAIR_CODES.absent, "Nobody has authorized this Flow to spend anything, so no model was available to repair it.");
  }
  const repair = authorization.repair;
  if (!repair || repair.enabled !== true) {
    return refusal(AUTOMATION_STUDIO_UNATTENDED_REPAIR_CODES.disabled, "This Flow's standing authorization pays for judging its results and not for repairing it, so no model was available to repair it.");
  }
  if (!authorization.keyId.trim() || !authorization.unlockSessionId.trim() || !positive(authorization.maxTotalCostUsd) || !positive(repair.maxCostUsdPerRun)) {
    return refusal(AUTOMATION_STUDIO_UNATTENDED_REPAIR_CODES.invalid, "The stored repair authorization names no usable key or spending limit, so it was not redeemed.");
  }
  // The same expiry as the check's, read the same way. A person renewing an
  // authorization renews both halves of it at once, which is the point of its
  // being one record.
  if (!Number.isFinite(authorization.expiresAtMs) || authorization.expiresAtMs <= input.nowMs) {
    return refusal(AUTOMATION_STUDIO_UNATTENDED_REPAIR_CODES.expired, "The standing authorization for this Flow has expired, so it was not repaired.");
  }
  const spent = Number.isFinite(input.spentUsd) ? Math.max(0, input.spentUsd) : 0;
  const remainingCostUsd = authorization.maxTotalCostUsd - spent;
  // The remainder has to cover a whole repair, not part of one, for the reason
  // `redeem.ts` gives about a call: a repair stopped halfway through is still
  // billed and has changed nothing.
  if (remainingCostUsd < repair.maxCostUsdPerRun) {
    return refusal(AUTOMATION_STUDIO_UNATTENDED_REPAIR_CODES.exhausted, `This Flow has spent its ${authorization.maxTotalCostUsd.toFixed(2)} USD limit, so it was not repaired.`);
  }
  return {
    redeemed: true,
    keyId: authorization.keyId,
    unlockSessionId: authorization.unlockSessionId,
    authorizedByUserId: authorization.authorizedByUserId,
    taskKinds: AUTOMATION_STUDIO_UNATTENDED_REPAIR_TASK_KINDS,
    maxEstimatedCostUsdPerRun: Math.min(repair.maxCostUsdPerRun, remainingCostUsd),
    remainingCostUsd
  };
}

function refusal(code: string, reason: string): AutomationStudioUnattendedRepairRedemption {
  return { redeemed: false, code, reason };
}

function positive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
