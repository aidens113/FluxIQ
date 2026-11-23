// Whether a replay of a saved Flow is accepted on its own record, with no judge call (task speed S9).
//
// A saved Flow whose one judged whole run passed is a Flow a judge has already said does what was asked.
// A later run of exactly that Flow, every step running as saved with its own checks passing, reading
// the same shape of rows, is that result again: judging it again cost one call and 9-11 seconds on
// every replay, and could only say what the record already shows. So such a replay is accepted on its
// record, and the judge is asked whenever the replay deviates. Each deviation is named, in this order:
//
//   judge_always         the caller asked for the judge every time (a FluxNode's `judge: always`)
//   asked_again          the person pressed Run again: they asked for the change again, which only a
//                        judge can say this run made (its lasting acts pressed again are not the record)
//   flow_not_proven      no judged whole run of this exact Flow is behind it: this run is that run
//   flow_not_confirmed   the saved Flow's label is not confirmed
//   run_not_whole        the run did not reach the Flow's end
//   repaired             a repair, a round or a step run again changed the page after the run
//   step_failed          a step failed or was never reached
//   step_routed          the page sent the run to another step than the saved order
//   act_not_done         a step was passed over and what it does was not done
//   shape_unknown        the accepted run's read shape was not kept, so nothing to compare with
//   shape_differs        the rows read are not in the accepted run's shape (other columns, or rows
//                        where it had none, or none where it had rows)
//
// Passed over as saved, and no deviation: an act already done or a control already in its asked state
// (a repeat does not press twice), a sometimes-present step whose control was not there, and a step
// whose page never arose because the act before it was already done. The saved Flow wrote each of
// these ways on itself.
//
// **A check a person cleared is no deviation (t972).** It is the site asking the person, not the Flow
// or the page changing under it, and the engine has already settled the step it met
// (`engine/automation/person-cleared.ts`): a step whose act was not made ran again and its own record
// says how that went (a failure, a retry), one whose act was made went on, and a lasting act nothing
// could settle stopped the run as Outcome uncertain, which reads as `run_not_whole` here. Until t972 it
// was `check_cleared` and sent every such replay to the judge: on a site that puts its traffic screen in
// front of every third results load, every replay of a saved Flow spent a judge call on a run that had
// gone exactly as saved. The contract keeps the word, because attempts stored before t972 carry it;
// nothing writes it now.
//
// **A successful automatic retry is no deviation (t985, F24).** Retries are part of
// the saved execution contract. Their count does not change the Flow or invalidate
// a step whose final record passed. Failed/incomplete runs, repairs, routing and
// shape changes still fail the independent checks below. Keep step_retried in the
// public stored-attempt vocabulary for historical records, but never emit it here.
//
// **The quality guard** is the Lab's own oracle, which needs no model: a replay series per realistic
// task must keep its right-answer rate (`docs/working/task-speed-plan.md`, S9). The rule's risk is a
// site whose data changed under an unchanged structure; the shape check catches a read that came back
// empty or different, not a different row.

import { AUTOMATION_STUDIO_TASK_REPLAY_DEVIATIONS, type AutomationStudioTaskReplayDeviation } from "../../../../../api-contracts/automation.ts";
import type { AutomationStudioAnswerFirstReadShape, AutomationStudioAnswerFirstReplayRecord } from "./replay-record.ts";

/** The contract's word that stored attempts may still carry and this rule no longer names (header, t972). */
type NoLongerNamed = "check_cleared" | "step_retried";

export type AutomationStudioAnswerFirstReplayDeviation = Exclude<AutomationStudioTaskReplayDeviation, NoLongerNamed>;

/** Every deviation the rule names, in the order it is checked (header): the contract's closed words, since an attempt's outcome carries them (t897). */
export const AUTOMATION_STUDIO_ANSWER_FIRST_REPLAY_DEVIATIONS: readonly AutomationStudioAnswerFirstReplayDeviation[] = AUTOMATION_STUDIO_TASK_REPLAY_DEVIATIONS.filter((deviation): deviation is AutomationStudioAnswerFirstReplayDeviation => deviation !== "check_cleared" && deviation !== "step_retried");

export function automationStudioAnswerFirstReplayStands(
  record: AutomationStudioAnswerFirstReplayRecord,
  now: { shape: AutomationStudioAnswerFirstReadShape; judge?: "auto" | "always" | "off" | undefined; askedAgain?: boolean | undefined }
): { stands: true } | { stands: false; deviation: AutomationStudioAnswerFirstReplayDeviation } {
  const deviated = (deviation: AutomationStudioAnswerFirstReplayDeviation) => ({ stands: false as const, deviation });
  if (now.judge === "always") return deviated("judge_always");
  if (now.askedAgain === true) return deviated("asked_again");
  if (!record.saved.provenWhole) return deviated("flow_not_proven");
  if (record.saved.label !== "confirmed") return deviated("flow_not_confirmed");
  if (!record.reachedEnd) return deviated("run_not_whole");
  if (record.repaired) return deviated("repaired");
  const { steps } = record;
  if (steps.length === 0 || steps.some((step) => step.ran === "failed" || step.ran === "not_reached")) return deviated("step_failed");
  if (steps.some((step) => step.ran === "skipped" && (step.skipped === undefined || step.skipped === "routed_elsewhere"))) return deviated("step_routed");
  if (steps.some((step) => step.skipped === "absent_not_done")) return deviated("act_not_done");
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
