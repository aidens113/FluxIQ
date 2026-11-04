// A run's completed acts as merged acts (`engine/automation/lifecycle-run/completed-act.ts`).

import type { AutomationStudioCompletedAct } from "../../../../../engine/automation/lifecycle-run/index.ts";
import type { AutomationStudioAttemptActMerged } from "../../contracts.ts";

const RUN_ACT_WORDS = "Did a step of the Flow";

/** Each as landed under its own key. It carries no class, and its row only in a person's words, so it is told and refuses by its node alone. */
export function automationStudioAttemptActsFromRunActs(acts: readonly AutomationStudioCompletedAct[]): AutomationStudioAttemptActMerged[] {
  return acts.map((act) => ({
    sourceId: act.key,
    what: RUN_ACT_WORDS,
    state: "landed",
    stage: "run",
    ...(act.row === undefined ? { steps: [`node:${act.nodeId}`] } : {})
  }));
}
