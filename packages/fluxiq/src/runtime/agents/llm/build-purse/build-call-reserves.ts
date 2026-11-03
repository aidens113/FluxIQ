// What a build's purse holds for the part of a call it cannot measure before
// sending it (t254).
//
// **No reply is capped (user, 2026-10-03).** "It should be billed at how much it
// actually costs, and i never told you to add any cap on output. Remove that."
// No request sends `max_tokens` (`../deepseek/request-body.ts`), so a reply's
// length is not known until it arrives. The purse still holds every call before
// it is sent and refuses one whose hold does not fit what is left; the reply
// side of that hold is the largest reply observed for the call's kind, with a
// margin of two. The evidence is t254's six live runs of 2026-10-03, 206 calls,
// every one `finish_reason: stop`
// (`docs/working/language-driven-flow-loop-plan/reports/t254-purse-hold-investigation.md`
// in the extension repository).
//
// **What that leaves.** A reserve is not a cap, so a reply longer than it costs
// more than it was held at. The ceiling can then be crossed, and only by the part
// of that one reply beyond its reservation: every call is held before it is sent,
// a build's calls are made one at a time, and once one has overshot nothing more
// fits. The purse records each overshoot, in calls and in dollars
// (`./purse.ts`, `breaches` and `overshootUsd`), and the loop's accounting
// carries both (`budgetBreaches`, `budgetOvershootUsd`), so a crossing is never
// hidden.

/** The reply and judge-input reserves a build's purse holds calls at. */
export const AUTOMATION_STUDIO_LLM_BUILD_CALL_RESERVES = Object.freeze({
  /**
   * A build decision's reply (`evidence_tool_decision`), also the instruction
   * reading's, which is made as one: 750 tokens, twice the largest of 177
   * decision replies (371; p95 256, median 91). The four instruction readings
   * replied with at most 129. t234's older corpus of 6,119 replies had one of
   * 593, inside this reserve.
   */
  decisionReplyTokens: 750,
  /**
   * A judge's reply, first or confirming (`loop_verification`): 1,250 tokens,
   * twice the largest of 18 judge replies (625, a confirming call; first calls
   * at most 537, median 425).
   */
  judgeReplyTokens: 1_250,
  /**
   * A judge's input, by Core's bytes/3 measure, before any judge of the build
   * has been priced: 8,000 tokens (the 18 judge calls measured at most 7,781,
   * median 5,774). It only sizes the judging reserve a build keeps back while it
   * explores; every judge call is held at its own measured request.
   */
  judgeInputTokens: 8_000
});
