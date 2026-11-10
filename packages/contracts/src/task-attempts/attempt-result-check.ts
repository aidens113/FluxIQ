// Whether an attempt and its result say the same thing. Each parser reads one record,
// so neither can see a green tick on a refuted answer. Whoever writes an attempt's
// ending calls this before it stores or reports one.
//
// **The hard rule behind it (user, 2026-11-03).** A task ends only with its result,
// with its budget gone, or with a person stopping it. So an `achieved` task has a
// confirmed result, and a task whose budget ran out still shows what it
// got, labelled as not confirmed: it would be `achieved` if it were.
//
// **One exception, said on the attempt (`checkingOff`).** A caller that drives an
// attempt from code may turn checking off: its judge `off` and no check of its own.
// Its result is then the result, taken as it stands, and nothing confirmed it, so
// that attempt alone may be `achieved` with an `unverified` result. It is never a
// person's Stop, and an attempt without the marker is held to the rule above.

import type { AutomationStudioTaskAttempt } from "./task-attempt.ts";
import type { AutomationStudioTaskResult, AutomationStudioTaskResultKind } from "./task-result.ts";

/** The kinds a budget-out result may be (plan, D8): what it got, as rows or as a partial. */
const BUDGET_OUT_KINDS: ReadonlySet<AutomationStudioTaskResultKind> = new Set(["rows", "partial"]);

export type AutomationStudioTaskAttemptResultCheck =
  | { ok: true }
  | { ok: false; issues: string[] };

/**
 * Checks two records that each parsed. `result` is undefined when the attempt has
 * none. Issues are stable codes prefixed `task_outcome.`:
 *
 * - `other_attempts_result`: the result names another attempt.
 * - `achieved_needs_result`: `achieved` with no result.
 * - `achieved_not_confirmed`: `achieved` with a result not `confirmed`. An unsure
 *   judge keeps looking (plan, "Keep Going Until The Result"), so only a yes ends it.
 *   An attempt marked `checkingOff` may also be `achieved` with an `unverified`
 *   result, never a `refuted` one.
 * - `budget_out_needs_result`: `budget_out` with no result. One that found nothing
 *   still has one: an empty `partial`.
 * - `budget_out_not_a_partial_or_rows`: `budget_out` with any other kind.
 * - `budget_out_but_confirmed`: `budget_out` labelled `confirmed`. A confirmed result
 *   is `achieved`, whatever the improving after it spent.
 *
 * `working`, `waiting_for_person` and `stopped_by_person` may hold a result or none:
 * the best so far is kept throughout, and a person may stop before there is one.
 */
export function checkAutomationStudioTaskAttemptResult(
  attempt: Pick<AutomationStudioTaskAttempt, "attemptId" | "status"> & { checkingOff?: true | undefined },
  result: AutomationStudioTaskResult | undefined
): AutomationStudioTaskAttemptResultCheck {
  const issues: string[] = [];
  if (result !== undefined && result.attemptId !== attempt.attemptId) issues.push("task_outcome.other_attempts_result");
  if (attempt.status === "achieved") {
    if (result === undefined) issues.push("task_outcome.achieved_needs_result");
    else if (result.label !== "confirmed" && !(attempt.checkingOff === true && result.label === "unverified")) issues.push("task_outcome.achieved_not_confirmed");
  }
  if (attempt.status === "budget_out") {
    if (result === undefined) issues.push("task_outcome.budget_out_needs_result");
    else {
      if (!BUDGET_OUT_KINDS.has(result.kind)) issues.push("task_outcome.budget_out_not_a_partial_or_rows");
      if (result.label === "confirmed") issues.push("task_outcome.budget_out_but_confirmed");
    }
  }
  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}
