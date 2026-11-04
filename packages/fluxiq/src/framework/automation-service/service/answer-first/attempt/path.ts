// How an attempt went at its task, once it has ended (design, "Path"), for the row and for the
// chat's "Used what I saved".
//
//   no run went out                                                     explore
//   a whole run, judged yes, no rounds                                  run_flow
//   rounds, and a yes with a forward run reaching the last proposed
//   step, all in the first round                                        run_flow_then_repair
//   anything else after a run                                           run_flow_then_explore

import type { AutomationStudioTaskAttemptPath } from "@fluxiq/contracts/automation";
import { automationStudioFlowDraftStepIsProposed } from "../../../../../runtime/flow-authoring/draft/index.ts";
import type { AutomationStudioAnswerFirstRoundsEnding } from "./rounds.ts";
import type { AutomationStudioAnswerFirstAttemptRun } from "./state.ts";

export function automationStudioAnswerFirstPathAtEnding(run: AutomationStudioAnswerFirstAttemptRun, ending: AutomationStudioAnswerFirstRoundsEnding): AutomationStudioTaskAttemptPath {
  if (!run.flowRun?.wentOut) return "explore";
  if (ending !== "achieved") return "run_flow_then_explore";
  if (run.flowRun.judged === "yes") return "run_flow";
  return run.path === "run_flow_then_repair" && forwardReachedTheLastStep(run) ? "run_flow_then_repair" : "run_flow_then_explore";
}

function forwardReachedTheLastStep(run: AutomationStudioAnswerFirstAttemptRun): boolean {
  const last = Math.max(0, ...run.steps.filter(automationStudioFlowDraftStepIsProposed).map((step) => step.position));
  return last > 0 && run.forwardReached >= last;
}
