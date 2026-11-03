// The acts a trial port hands its change's finish, split (t796): the acts the
// trial made or found already done, which its witnesses and packet read, and
// the steps its act ledger says it never ran on some passes, which only the
// part proofs read (`./part-acting.ts`, `./proof.ts`). Pure.

import type { AutomationStudioTrialChangeAct, AutomationStudioTrialChangeMadeAct, AutomationStudioTrialChangeNotRunAct } from "./contracts.ts";

/** `handed` split (header), each side in the order handed. */
export function automationStudioTrialChangeActsSplit(handed: readonly AutomationStudioTrialChangeAct[]): { acts: AutomationStudioTrialChangeMadeAct[]; notRun: AutomationStudioTrialChangeNotRunAct[] } {
  const acts: AutomationStudioTrialChangeMadeAct[] = [], notRun: AutomationStudioTrialChangeNotRunAct[] = [];
  for (const act of handed) {
    if (act.outcome === "not_run") notRun.push(act);
    else acts.push(act);
  }
  return { acts, notRun };
}
