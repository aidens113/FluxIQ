/**
 * The status sentence (`ClientGatewayActivity.label`) each verdict of a run's
 * result check is said in (`programs/automation-studio/runtime/result-verification/check-activity.ts`).
 * Written once, here, because a chat card reads two of them back: a result
 * Core could not confirm (`unconfirmed`, the two checks disagreed or the model
 * was unsure) and one it could not check at all (`unchecked`) are not a pass,
 * and they are not a failure either. The row's `status` is `failed` for both,
 * fail-closed, so the label is the only thing that tells them from `refuted`.
 */
export const ACTIVITY_RESULT_CHECK_LABELS = Object.freeze({
  answers: "The result answers the request",
  refuted: "The result doesn't answer the request",
  unconfirmed: "Couldn't confirm the result answers the request",
  unchecked: "The result couldn't be checked"
} as const);
