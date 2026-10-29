// A live trial's acts as its readings attribute them (t775 D1): each landed
// act of the run as `changed` (it applied its effect), with its step's stamp
// and pass, and each step the domain found already in its asked state as
// `already_in_state`, with its pass and readable row, all numbered as the
// trial's feedback numbers its steps. Pure.
//
// **A landed act's own control (t787).** Where the act's diff read the control
// it pressed -- its place (`spot.place`) and the place's counts just before and
// just after it on its page (`controls`, `../../service/candidate-trial/landed-acts.ts`)
// -- the act carries them as `control`, with its page's location, so each pass
// of a loop is witnessed at its own item (`./pass-witnesses.ts`). Either half
// missing, the act carries none and is attributed by its stamp as before.

import type { AutomationStudioTrialActControl, AutomationStudioTrialChangeAct } from "./contracts.ts";

/** What of a landed act's diff names its control (`landed-acts.ts`, header). */
type LandedControl = { spot?: { place?: string | undefined } | undefined; controls?: { location?: string | undefined; before: Readonly<Record<string, number>>; after: Readonly<Record<string, number>> } | undefined };

/** The trial's acts for its readings (header), landed first, in the order each list holds them. */
export function automationStudioTrialChangeActs(
  landed: ReadonlyArray<{ step: number; definitionId: string; witness?: unknown; pass?: { number: number; of: number } | undefined } & LandedControl>,
  already: ReadonlyArray<{ step: number; definitionId: string; pass?: { number: number; of: number } | undefined; row?: string | undefined }> = []
): AutomationStudioTrialChangeAct[] {
  return [
    ...landed.map((act) => {
      const control = controlOf(act);
      return { step: act.step, definitionId: act.definitionId, ...(act.witness !== undefined ? { witness: act.witness } : {}), ...(act.pass ? { pass: { ...act.pass } } : {}), outcome: "changed" as const, ...(control ? { control } : {}) };
    }),
    ...already.map((act) => ({ step: act.step, definitionId: act.definitionId, ...(act.pass ? { pass: { ...act.pass } } : {}), ...(act.row !== undefined ? { row: act.row } : {}), outcome: "already_in_state" as const }))
  ];
}

/** The act's own control, where its diff named the place and read it on both sides (header). */
function controlOf(act: LandedControl): AutomationStudioTrialActControl | undefined {
  const place = act.spot?.place, read = act.controls;
  if (place === undefined || !read) return undefined;
  return { place, ...(read.location !== undefined ? { location: read.location } : {}), before: { ...read.before }, after: { ...read.after } };
}
