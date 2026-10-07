// Whether a call's outcome says it may work if made again later: a rate limit,
// a control briefly disabled, a page still loading. Such a call is never a
// repeat to refuse (`./outcomes.ts`), and never one more refusal of a kind in a
// row (`../decision-handlers/refusal-run.ts`).

/** Words in a result code or reason that say the call may work if made again later. */
const RETRY_LATER = /rate[_-]?limit|too[_-]?many|throttl|retry|disabled|busy|not[_-]?ready|loading|timed[_-]?out|timeout|try[_-]?again/iu;

/** Whether `resultCode` or `resultReason` says the call may work if made again later. */
export function automationStudioLlmEvidenceRetriesLater(resultCode: string | undefined, resultReason: string | undefined): boolean {
  return RETRY_LATER.test(`${resultCode ?? ""} ${resultReason ?? ""}`);
}
