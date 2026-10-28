// A live trial's acts as its readings attribute them (t775 D1): each landed
// act of the run as `changed` (it applied its effect), with its step's stamp
// and pass, and each step the domain found already in its asked state as
// `already_in_state`, with its pass and readable row, all numbered as the
// trial's feedback numbers its steps. Pure.

import type { AutomationStudioTrialChangeAct } from "./contracts.ts";

/** The trial's acts for its readings (header), landed first, in the order each list holds them. */
export function automationStudioTrialChangeActs(
  landed: ReadonlyArray<{ step: number; definitionId: string; witness?: unknown; pass?: { number: number; of: number } | undefined }>,
  already: ReadonlyArray<{ step: number; definitionId: string; pass?: { number: number; of: number } | undefined; row?: string | undefined }> = []
): AutomationStudioTrialChangeAct[] {
  return [
    ...landed.map((act) => ({ step: act.step, definitionId: act.definitionId, ...(act.witness !== undefined ? { witness: act.witness } : {}), ...(act.pass ? { pass: { ...act.pass } } : {}), outcome: "changed" as const })),
    ...already.map((act) => ({ step: act.step, definitionId: act.definitionId, ...(act.pass ? { pass: { ...act.pass } } : {}), ...(act.row !== undefined ? { row: act.row } : {}), outcome: "already_in_state" as const }))
  ];
}
