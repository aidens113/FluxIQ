// Whether a standing authorization may pay for this call, and for how much.
//
// Pure, and the whole of the protection. Every refusal below is fail-closed:
// anything this function does not positively recognise as within scope, within
// its expiry and within its ceiling is refused, and the run then records
// `unverified` with the refusal's own code rather than being reported as a
// result that was right.
//
// The scope check is first and is not parameterised. `loop_verification` is
// the only value the record can carry and the only value this will pass, so
// there is no argument, no settings field and no configuration by which a
// standing authorization could come to pay for a diagnosis, an exploration or
// a patch.

import { AUTOMATION_STUDIO_RESULT_CHECK_AUTHORIZATION_CODES, AUTOMATION_STUDIO_RESULT_CHECK_TASK_KIND, type AutomationStudioResultCheckAuthorization, type AutomationStudioResultCheckRedemption } from "./contracts.ts";

export function redeemAutomationStudioResultCheckAuthorization(input: {
  authorization: AutomationStudioResultCheckAuthorization | undefined;
  /** What the caller wants to spend it on. Anything but the one task kind is refused. */
  taskKind: string;
  nowMs: number;
  /** What has already been spent against this authorization, from the Flow's own run history. */
  spentUsd: number;
}): AutomationStudioResultCheckRedemption {
  const authorization = input.authorization;
  if (!authorization) {
    return refusal(AUTOMATION_STUDIO_RESULT_CHECK_AUTHORIZATION_CODES.absent, "Nobody has authorized result checking for this Flow, so no model was available to judge its result.");
  }
  if (input.taskKind !== AUTOMATION_STUDIO_RESULT_CHECK_TASK_KIND || authorization.taskKind !== AUTOMATION_STUDIO_RESULT_CHECK_TASK_KIND) {
    return refusal(AUTOMATION_STUDIO_RESULT_CHECK_AUTHORIZATION_CODES.scope, "A standing result-check authorization pays for judging a finished run's result and for nothing else.");
  }
  if (!authorization.keyId.trim() || !authorization.unlockSessionId.trim() || !positive(authorization.maxTotalCostUsd) || !positive(authorization.maxCostUsdPerCall)) {
    return refusal(AUTOMATION_STUDIO_RESULT_CHECK_AUTHORIZATION_CODES.invalid, "The stored result-check authorization names no usable key or spending limit, so it was not redeemed.");
  }
  if (!Number.isFinite(authorization.expiresAtMs) || authorization.expiresAtMs <= input.nowMs) {
    return refusal(AUTOMATION_STUDIO_RESULT_CHECK_AUTHORIZATION_CODES.expired, "The standing authorization for checking this Flow's results has expired, so this run's result was not judged.");
  }
  const spent = Number.isFinite(input.spentUsd) ? Math.max(0, input.spentUsd) : 0;
  const remainingCostUsd = authorization.maxTotalCostUsd - spent;
  // The ceiling has to cover a whole call, not part of one. A remainder too
  // small to pay for the call it is about to authorize is exhausted, because
  // spending it would leave the question half-asked and still billed.
  if (remainingCostUsd < authorization.maxCostUsdPerCall) {
    return refusal(AUTOMATION_STUDIO_RESULT_CHECK_AUTHORIZATION_CODES.exhausted, `Checking this Flow's results has spent its ${authorization.maxTotalCostUsd.toFixed(2)} USD limit, so this run's result was not judged.`);
  }
  return {
    redeemed: true,
    keyId: authorization.keyId,
    unlockSessionId: authorization.unlockSessionId,
    authorizedByUserId: authorization.authorizedByUserId,
    maxEstimatedCostUsd: Math.min(authorization.maxCostUsdPerCall, remainingCostUsd),
    remainingCostUsd
  };
}

function refusal(code: string, reason: string): AutomationStudioResultCheckRedemption {
  return { redeemed: false, code, reason };
}

function positive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
