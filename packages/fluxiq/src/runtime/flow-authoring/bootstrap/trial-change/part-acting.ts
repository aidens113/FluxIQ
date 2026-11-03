// The steps that do a task part's lasting act, each with the passes the trial
// never ran it on (t796). Pure.
//
// A part's acting steps are the plan's steps serving it (`./steps.ts`: every
// step of the subflow the part belongs to) that declare a lasting consequence,
// any class, as the run reads a lasting act
// (`../../executor/defensive/lasting-act.ts`). Each is matched to the steps the
// trial's act ledger says were not run (`./after-read.ts`, `not_run` entries)
// by its definition, by its plan key where both name one, and by its label
// where the plan gives one: a plan step and the graph node built from it carry
// the same label and key (`../adaptation.ts`). Only a lasting entry matches.
// A step with no such entry ran on every pass it had, or had none: the proof
// is then computed from what was read (`./proof.ts`).

import type { AutomationStudioTrialChangeNotRunAct, AutomationStudioTrialChangeStep, AutomationStudioTrialNotRun } from "./contracts.ts";

/** Each acting step of `part`, with the ledger's not-run entries for it (header); none where the part has no acting step. */
export function automationStudioTrialPartActing(part: string, steps: readonly AutomationStudioTrialChangeStep[], notRun: readonly AutomationStudioTrialChangeNotRunAct[]): Array<{ notRun: AutomationStudioTrialNotRun[] }> {
  return steps
    .filter((step) => step.parts.includes(part) && step.consequences.length > 0)
    .map((step) => ({
      notRun: notRun
        .filter((entry) => entry.lasting && entry.definitionId === step.definitionId
          && (step.key === undefined || entry.key === undefined || entry.key === step.key)
          && (step.label === undefined || entry.notRun.label === step.label))
        .map((entry) => ({ ...entry.notRun, passes: [...entry.notRun.passes] }))
    }));
}
