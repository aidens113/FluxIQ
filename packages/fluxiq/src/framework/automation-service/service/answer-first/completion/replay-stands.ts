// Whether a replay of a saved Flow is accepted on its own record, with no judge call (task speed S9).
//
// A saved Flow whose one judged whole run passed is a Flow a judge has already said does what was asked.
// A later run of exactly that Flow, every step running as saved with its own checks passing, reading
// the same shape of rows, is that result again: judging it again cost one call and 9-11 seconds on
// every replay, and could only say what the record already shows. So such a replay is accepted on its
// record, and the judge is asked whenever the replay deviates. Each deviation is named, in this order:
//
//   judge_always         the caller asked for the judge every time (a FluxNode's `judge: always`)
//   flow_not_proven      no judged whole run of this exact Flow is behind it: this run is that run
//   flow_not_confirmed   the saved Flow's label is not confirmed
//   run_not_whole        the run did not reach the Flow's end
//   repaired             a repair, a round or a step run again changed the page after the run
//   step_failed          a step failed or was never reached
//   step_routed          the page sent the run to another step than the saved order
//   act_not_done         a step was passed over and what it does was not done
//   check_cleared        a check only a person could clear met a step, and the run went on after it
//   step_retried         a step took more than its first attempt: the page was not as it was
//   shape_unknown        the accepted run's read shape was not kept, so nothing to compare with
//   shape_differs        the rows read are not in the accepted run's shape (other columns, or rows
//                        where it had none, or none where it had rows)
//
// Passed over as saved, and no deviation: an act already done or a control already in its asked state
// (a repeat does not press twice), a sometimes-present step whose control was not there, and a step
// whose page never arose because the act before it was already done. The saved Flow wrote each of
// these ways on itself.
//
// **The quality guard** is the Lab's own oracle, which needs no model: a replay series per realistic
// task must keep its right-answer rate (`docs/working/task-speed-plan.md`, S9). The rule's risk is a
// site whose data changed under an unchanged structure; the shape check catches a read that came back
// empty or different, not a different row.

import type { AutomationStudioAnswerFirstReadShape, AutomationStudioAnswerFirstReplayRecord } from "./replay-record.ts";

/** Every deviation the rule names, in the order it is checked (header). */
export const AUTOMATION_STUDIO_ANSWER_FIRST_REPLAY_DEVIATIONS = [
  "judge_always", "flow_not_proven", "flow_not_confirmed", "run_not_whole", "repaired", "step_failed", "step_routed",
  "act_not_done", "check_cleared", "step_retried", "shape_unknown", "shape_differs"
] as const;

export type AutomationStudioAnswerFirstReplayDeviation = (typeof AUTOMATION_STUDIO_ANSWER_FIRST_REPLAY_DEVIATIONS)[number];

export function automationStudioAnswerFirstReplayStands(
  record: AutomationStudioAnswerFirstReplayRecord,
  now: { shape: AutomationStudioAnswerFirstReadShape; judge?: "auto" | "always" | "off" | undefined }
): { stands: true } | { stands: false; deviation: AutomationStudioAnswerFirstReplayDeviation } {
  const deviated = (deviation: AutomationStudioAnswerFirstReplayDeviation) => ({ stands: false as const, deviation });
  if (now.judge === "always") return deviated("judge_always");
  if (!record.saved.provenWhole) return deviated("flow_not_proven");
  if (record.saved.label !== "confirmed") return deviated("flow_not_confirmed");
  if (!record.reachedEnd) return deviated("run_not_whole");
  if (record.repaired) return deviated("repaired");
  const { steps } = record;
  if (steps.length === 0 || steps.some((step) => step.ran === "failed" || step.ran === "not_reached")) return deviated("step_failed");
  if (steps.some((step) => step.ran === "skipped" && (step.skipped === undefined || step.skipped === "routed_elsewhere"))) return deviated("step_routed");
  if (steps.some((step) => step.skipped === "absent_not_done")) return deviated("act_not_done");
  if (steps.some((step) => step.personCleared === true)) return deviated("check_cleared");
  if (steps.some((step) => (step.retries ?? 0) > 0)) return deviated("step_retried");
  const accepted = record.saved.shape;
  if (!accepted) return deviated("shape_unknown");
  if (!sameShape(accepted, now.shape)) return deviated("shape_differs");
  return { stands: true };
}

function sameShape(accepted: AutomationStudioAnswerFirstReadShape, now: AutomationStudioAnswerFirstReadShape): boolean {
  if (accepted.empty !== now.empty) return false;
  const columns = new Set(accepted.columns);
  return columns.size === new Set(now.columns).size && now.columns.every((column) => columns.has(column));
}
