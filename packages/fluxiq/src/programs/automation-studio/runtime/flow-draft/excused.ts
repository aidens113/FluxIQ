// A step a test did not get to hold, and that the Flow passes over anyway.
//
// **The failure that named it (live run `run-murzln6g-11debe1d`, t193 1002-M,
// C6).** Draft step 15 pressed the added-to-cart drawer's "×", which the host
// had marked an interruption, so the Flow is written with it optional
// (`./interruption.ts`). The test only checked the Add to cart before it
// (`./verify-only.ts`), no drawer opened, and the "×" failed. The test passed
// over it, as the Flow would, and passed. But every account of that test said
// only `failed`: the judge's (`../result-verification/build-test/summary.ts`)
// -- whose second answer asked to "fix or remove the failed step 15" -- and the
// chat's card, "Didn't work: it didn't work the same way again". The verdict
// had excused the step and kept that to itself.
//
// **What it is.** A step whose replay did not hold (`failed`, `changed`,
// `unreproducible`) and that does not stand in the way of the proposal,
// because the draft says the Flow does not always run it
// (`automationStudioFlowDraftConditionalStepReasons` in `./routing.ts`) or
// because it needed what a checked step's withheld effect would have made
// (`withheldBy`, `./verify-only.ts`). Exactly the steps the verdict exempts,
// decided where the replay decides them (`../llm/node-tools/replay-draft.ts`)
// and carried on the outcome, so the judge, the model and the chat read one
// answer.

import type { AutomationStudioFlowDraftReplayOutcome } from "./dry-run.ts";
import type { AutomationStudioFlowDraftConditionalReason } from "./routing.ts";

/** Why a test passed over a step that did not hold: why the Flow does not always run it, or `withheld`. */
export type AutomationStudioFlowDraftExcusedReason = AutomationStudioFlowDraftConditionalReason | "withheld";

/** Why the Flow passes over a step of each kind, in Core's words. */
const WHY: Readonly<Record<AutomationStudioFlowDraftConditionalReason, string>> = {
  interruption: "optional: it answers something not always in front of the page (a dialog, a banner, a panel), so the Flow passes over it when that is not there",
  optional: "optional: the Flow passes over it when it does not work",
  only_if: "conditional: the Flow runs it only when the step it depends on succeeded",
  check: "a check: when it does not hold, the Flow skips the step that depends on it",
  fallback: "a fallback: the Flow runs it only when another step fails",
  repeat: "repeated: the Flow runs it once per row, or while a check holds, so it may not run at all"
};

/** What the step did in this test, by its status. */
const HERE: Readonly<Record<Exclude<AutomationStudioFlowDraftReplayOutcome["status"], "replayed">, string>> = {
  failed: "in this test it did not run",
  changed: "in this test it produced nothing",
  unreproducible: "in this test its target was not there"
};

/**
 * Why a test passed over this step, in Core's words for the judge and the
 * model, or nothing when it did not: a step that held, or one that did not and
 * stands in the way. "optional: the Flow passes over it when it does not work;
 * in this test its target was not there, which does not stop the Flow."
 */
export function automationStudioFlowDraftExcusedWords(outcome: AutomationStudioFlowDraftReplayOutcome): string | undefined {
  if (outcome.excused === undefined || outcome.status === "replayed") return undefined;
  const why = outcome.excused === "withheld"
    ? `it needed what step ${outcome.withheldBy ?? "before it"} would have done, and the test only checked that step rather than doing it`
    : WHY[outcome.excused];
  return `${why}; ${HERE[outcome.status]}, which does not stop the Flow.`;
}
