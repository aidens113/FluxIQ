// An act of the site-reset ledger as the model is shown it, moved whole out of
// `../site-reset/ledger.ts` (t797, no change in behaviour) because the ledger and each of
// its collaborators (`./answers.ts`, `./recording.ts`,
// `./claims.ts`) name acts this way.

import type { AutomationStudioSiteResetNamedAct } from "../site-reset/index.ts";
import type { AutomationStudioSiteResetLedgerAct as Act } from "./act.ts";

/** An act as the model is shown it. */
export function automationStudioSiteResetLedgerNamedAct(act: Act): AutomationStudioSiteResetNamedAct {
  return { act: act.id, did: act.did, ...(act.call ? { call: act.call } : {}), ...(act.stillThere?.length ? { stillThere: [...act.stillThere] } : {}), ...(act.possible ? { possible: true as const } : {}) };
}
