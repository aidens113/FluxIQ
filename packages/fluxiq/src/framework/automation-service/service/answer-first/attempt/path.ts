// How an attempt went at its task, once it has ended (design, "Path"), for the row and for the
// chat's "Used what I saved".
//
//   no run went out                                                     explore
//   a whole run, judged yes, no rounds                                  run_flow
//   not achieved, and no round decided anything after the run           run_flow
//   rounds, and a yes with a forward run reaching the last proposed
//   step, all in the first round                                        run_flow_then_repair
//   anything else after a run                                           run_flow_then_explore
//
// An attempt that ran out, or was stopped, before any round made a decision worked nothing out, so
// it does not say it did. A carried-on attempt keeps its history: once a run has gone out it never
// reads `explore` again, and a press is a fresh start, so it is no longer a repair.

import type { AutomationStudioTaskAttemptPath } from "@fluxiq/contracts/automation";
import { automationStudioFlowDraftStepIsProposed } from "../../../../../runtime/flow-authoring/draft/index.ts";
import type { AutomationStudioAnswerFirstRoundsEnding } from "./rounds.ts";
import type { AutomationStudioAnswerFirstAttemptRun } from "./state.ts";

export function automationStudioAnswerFirstPathAtEnding(run: AutomationStudioAnswerFirstAttemptRun, ending: AutomationStudioAnswerFirstRoundsEnding): AutomationStudioTaskAttemptPath {
  const ran = run.flowRun?.wentOut === true || (run.prior !== undefined && run.prior.path !== "explore");
  if (!ran) return "explore";
  if (ending !== "achieved") return run.decidedAfterRun ? "run_flow_then_explore" : "run_flow";
  if (run.flowRun?.judged === "yes") return "run_flow";
  return run.path === "run_flow_then_repair" && forwardReachedTheLastStep(run) ? "run_flow_then_repair" : "run_flow_then_explore";
}

function forwardReachedTheLastStep(run: AutomationStudioAnswerFirstAttemptRun): boolean {
  const last = Math.max(0, ...run.steps.filter(automationStudioFlowDraftStepIsProposed).map((step) => step.position));
  return last > 0 && run.forwardReached >= last;
}
