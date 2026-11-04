// What a node's or a dispatch's own answer says of a lasting act, in a real run (t870, plan D6).
//
// An act's state comes from the answer, never from anyone's words, and reads the failure the
// way the engine reads it for the same act (`engine/automation/defensive/assess.ts`,
// `faultFromRecord`), so the record and the run never disagree on whether it may be pressed
// again:
//
//   failed, and the record says nothing acted   not on the record. The failure states
//                                                `unacted`, or was found while resolving the
//                                                target, before anything could act.
//   failed, and anything else                    may have landed. The engine does not repeat
//                                                it either: a page's silence is no proof.
//   thrown, or no answer at all                  may have landed: the answer was lost.
//   waiting, skipped, already in the state       nothing was pressed.
//   said to be uncertain                         may have landed.
//   success                                      landed. The engine may judge it again after
//                                                this answer (`record.doubted`).

import type { JsonValue } from "../../../../../core/index.ts";
import type { AutomationNodeExecutionResult } from "../../../../../components/automation/index.ts";

/** The reason a domain answers an act Core left uncertain with (`runtime/answer-first/act-record/gate/read-answer.ts`). */
const UNCERTAIN_REASON = "outcome_uncertain";
const ALREADY_IN_STATE = "already_in_state";
const NOT_YET_ACTING: ReadonlySet<unknown> = new Set(["waiting", "skipped"]);
const BEFORE_ANYTHING_ACTED: ReadonlySet<unknown> = new Set(["target_not_found", "target_ambiguous"]);

export type AutomationStudioAnswerFirstRunActNodeAnswerRead = { applied: boolean; uncertain: boolean };

/** What an answer says of the act it answers (header). */
export function automationStudioAnswerFirstRunActNodeAnswer(result: AutomationNodeExecutionResult | undefined): AutomationStudioAnswerFirstRunActNodeAnswerRead {
  if (!result) return { applied: false, uncertain: true };
  const { failure } = result;
  if (result.status === "failed") {
    const unacted = failure?.effect === "unacted" || failure?.stage === "target_resolution" || BEFORE_ANYTHING_ACTED.has(failure?.category);
    return { applied: false, uncertain: !unacted };
  }
  if (NOT_YET_ACTING.has(result.status)) return { applied: false, uncertain: false };
  const said = recordOf(result.outputs?.result);
  if (result.outputs?.skipped === ALREADY_IN_STATE || said?.skipped === ALREADY_IN_STATE) return { applied: false, uncertain: false };
  const uncertain = failure?.effect === "ambiguous" || said?.reason === UNCERTAIN_REASON || typeof said?.effectUncertain === "string";
  return { applied: !uncertain, uncertain };
}

function recordOf(value: JsonValue | undefined): Record<string, JsonValue> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : undefined;
}
