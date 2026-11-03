// A witness as a plan node carries it (t751, R3): the stamp keeps `via` and
// the ref or act it names, and drops every opaque token -- a list's scope and
// group, a control's place -- which never leave Core (`./witness.ts`). The
// step door answers this (`../site-reset/ledger.ts`, `admitStep`), and the
// trial act takes it back (`trialRan`). Pure.

import type { AutomationStudioSiteResetWitness, AutomationStudioSiteResetWitnessStamp } from "./witness.ts";

/** The JSON-safe stamp of `witness` (header). */
export function automationStudioSiteResetWitnessStampOf(witness: AutomationStudioSiteResetWitness): AutomationStudioSiteResetWitnessStamp {
  if (witness.via === "destination") return { via: "destination", ref: witness.ref };
  if (witness.via === "repeats") return { via: "repeats", act: witness.act };
  return { via: witness.via };
}
