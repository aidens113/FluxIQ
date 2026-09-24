// Where a finished run's result stands, in one word, for whoever reads the run.
//
// A verification that was never performed is not a verdict, and it was being
// read as one. Seven live runs on 2026-09-18 returned the wrong records and
// reported `passed`: each stored rows, so it had a result to judge, and each
// ran without a model, so nobody judged it. The run's record did say
// `performed: false`, but a reader looking at the run's status saw `succeeded`
// and nothing else, and a result nobody checked read as a result that was
// right.
//
// The run's status is deliberately left as its steps earned it. A saved Flow
// replayed on a schedule, with no model, is how most automations run, and
// failing every one of them for the absence of a judgement would break working
// automations to make a point. What changes is that the run now says, in a
// word a reader cannot mistake, that its result was not confirmed:
//
//   * `confirmed`  -- judged, and it answers the request.
//   * `refuted`    -- judged, and it does not, or nobody could tell, which
//                     fails closed; the run is `failed`.
//   * `unverified` -- there is a result, and nobody judged it, because no model
//                     was available to this run or because the verification did
//                     not finish (`core.result.verification_did_not_finish`);
//                     or it was judged twice and the two checks did not agree
//                     that it fails (`model_disagreed`, `model_unconfirmed`).
//                     Never to be presented as `confirmed`.
//   * `no_result`  -- historical. Until 2026-09-24 a run that stored no record
//                     set was not judged at all and was recorded this way. Such
//                     a run is now judged on what it did, like any other, so
//                     nothing produces this status any more; it stays in the
//                     vocabulary because the run store holds it on rows written
//                     before then and readers must still understand them.
//
// Any reason for skipping that this module does not recognise is `unverified`:
// a new way of not judging a result is still not a judgement.

import { automationStudioResultVerificationFailsRun, type AutomationStudioResultVerificationOutcome } from "./contracts.ts";

export type AutomationStudioResultVerificationStatus = "confirmed" | "refuted" | "unverified" | "no_result";

export function automationStudioResultVerificationStatus(outcome: AutomationStudioResultVerificationOutcome): AutomationStudioResultVerificationStatus {
  if (outcome.performed) {
    if (outcome.verdict === "answers") return "confirmed";
    return automationStudioResultVerificationFailsRun(outcome) ? "refuted" : "unverified";
  }
  return "unverified";
}
