// What the judge of an attempt that carries earlier acts is shown of how they were done (t1075 D): ahead of the
// attempt's own trail, the entries each carried act landed with in the attempt that made it (`./act-evidence.ts`),
// between two of Core's own entries that say what they are. In `run-mwynbry2-f3c88dc7` attempt 3's judge was shown
// "Already done earlier: + Add" and a trail in which that step was passed over, and said unsure: the condition the
// item was chosen by was in nothing it saw.
//
// **The words name no site, task or thing**: model guidance never teaches to the test. They are Core's, as
// `core.earlier_calls_not_held` is (`../trail/held.ts`), and a judge reads a `core.` entry as Core's own, never the
// host's (`runtime/result-verification/judge-evidence/core-call.ts`).

import type { AutomationStudioResultTrailStep } from "../../../../../runtime/result-verification/index.ts";

const OPENED: AutomationStudioResultTrailStep = {
  did: "core.carried_acts_evidence",
  outcome: "earlier_attempt",
  found: "The entries from here to core.carried_acts_evidence_end are what an earlier attempt at these same words did on the site to make the acts this attempt carries as already done earlier: for each such act, what that attempt looked at, read and chose before it, in the order it did them, then the act itself, each with what the site answered then. They are evidence of how those acts were chosen and that they landed, as the rest of the trail is of this attempt's own; this attempt did not do them again."
};

const CLOSED: AutomationStudioResultTrailStep = {
  did: "core.carried_acts_evidence_end",
  outcome: "earlier_attempt",
  found: "The entries after this one are what this attempt itself did."
};

/** The entries the judge is shown ahead of the attempt's own, for `carried` (act ids, in the record's order); none where none is held (header). */
export function automationStudioAnswerFirstCarriedTrail(carried: readonly string[], evidence: ReadonlyMap<string, readonly AutomationStudioResultTrailStep[]> | undefined): AutomationStudioResultTrailStep[] {
  const shown = new Set<AutomationStudioResultTrailStep>();
  for (const act of carried) for (const step of evidence?.get(act) ?? []) shown.add(step);
  return shown.size === 0 ? [] : [structuredClone(OPENED), ...[...shown].map((step) => structuredClone(step)), structuredClone(CLOSED)];
}
