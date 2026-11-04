// A trial's act ledger as merged acts (`SVC/candidate-trial/act-ledger.ts`).
//
// Only a lasting step that ran counts. `changed` landed; `no_change_seen` and a failure
// whose outcome stayed unknown may have; a step that was already in state, skipped,
// refused, or not reached did nothing. A step outside a repeat is known by its plan key
// and so refuses the same step of the Flow the trial proved. A pass of a repeat is only
// told: the ledger names a pass by number and its row in words, neither of which is the
// row's identity, and a pass's identity is never its position.

import type { AutomationStudioTrialActLedgerEntry, AutomationStudioTrialActLedgerPass } from "../../../../../framework/automation-service/service/candidate-trial/index.ts";
import type { AutomationStudioAttemptActMerged } from "../../contracts.ts";

const OUTCOME_UNCERTAIN_CODE = "run.outcome_uncertain";

/** Every lasting pass of `entries` that did or may have done something (header). */
export function automationStudioAttemptActsFromTrialLedger(entries: readonly AutomationStudioTrialActLedgerEntry[]): AutomationStudioAttemptActMerged[] {
  return entries.filter((entry) => entry.lasting).flatMap((entry) => entry.passes.flatMap((pass) => {
    const state = stateOf(pass);
    if (!state) return [];
    return [{
      sourceId: `trial/${entry.nodeId}/${pass.pass ?? 1}`,
      what: entry.label,
      state,
      stage: "trial" as const,
      actionId: entry.definitionId,
      ...(!entry.repeat ? { steps: [entry.key ? `step:${entry.key}` : `node:${entry.nodeId}`] } : {})
    }];
  }));
}

function stateOf(pass: AutomationStudioTrialActLedgerPass): AutomationStudioAttemptActMerged["state"] | undefined {
  if (pass.status === "ran") return pass.act === "changed" ? "landed" : pass.act === "no_change_seen" ? "may_have_landed" : undefined;
  return pass.status === "failed" && pass.code === OUTCOME_UNCERTAIN_CODE ? "may_have_landed" : undefined;
}
