// Looks and searches in a row with nothing done between them: a model that is
// searching instead of acting.
//
// **The failure this closes (lane A, t174).** On crossborder the model called
// `find_on_page "Voltbay"` 29 times on the unchanged home page, each answering
// "0 matches"; in run 41's re-author it made 45 finds with varied queries on
// one unchanged page. A look is never refused (`./outcomes.ts` leaves looks to
// the repeat policy), a find with a new query is new evidence to the
// no-progress guard, and a refused press between them reopened every look, so
// nothing ever counted them.
//
// **The rule.** Every look in a row that ran and left the page as it found it
// is counted, and anything else that ran resets the count: a call that is not a
// look, a look that found the page moved, an amendment or a completion. A look
// the loop answered from memory, or refused as a repeat, runs nothing and
// leaves the count as it was: the repeat policy and the repeat guard already
// answer those (`../repeat-policy.ts`, `./outcomes.ts`). So does a look the
// domain refused: it looked at nothing, and the repeat guard records it as a
// failed call (`run-mv5uu9g1-9d80deea`, where four refusals of one stale
// handle were four of the eight looks that ended the build). At
// `AUTOMATION_STUDIO_LLM_EVIDENCE_SEARCH_NOTE_AT` the model is told it has been
// searching without acting, with the looks it made, and pushed to act
// (`../decision-handlers/searching.ts`); at
// `AUTOMATION_STUDIO_LLM_EVIDENCE_MAX_LOOKS_IN_A_ROW` the round stalls, as three
// refused repeats do -- and a stall the caller can recover from, such as a
// candidate's latest revision with a retest left, runs that instead of ending
// (`../decision-handlers/stall-recovery.ts`). Information first, then the
// guard -- never a refusal of the look itself.

import type { JsonObject } from "../../../../../core/index.ts";

/** Looks in a row after which the model is told it is searching without acting. */
export const AUTOMATION_STUDIO_LLM_EVIDENCE_SEARCH_NOTE_AT = 5;

/** Looks in a row that stall the round: three more after the note. */
export const AUTOMATION_STUDIO_LLM_EVIDENCE_MAX_LOOKS_IN_A_ROW = 8;

/** One look of the run, as the note lists it. */
export type AutomationStudioLlmEvidenceLook = { callId: string; toolId: string; input: JsonObject };

/** The run of looks in a row. */
export type AutomationStudioLlmEvidenceSearchStreak = {
  /** One more look, with nothing done since the last. Returns how many in a row. */
  looked(look: AutomationStudioLlmEvidenceLook): number;
  /** Something other than looking happened: the run is over. */
  acted(): void;
  /** The looks in the current run, oldest first. */
  looks(): readonly AutomationStudioLlmEvidenceLook[];
};

export function automationStudioLlmEvidenceSearchStreak(): AutomationStudioLlmEvidenceSearchStreak {
  let run: AutomationStudioLlmEvidenceLook[] = [];
  return {
    looked(look) {
      run.push(look);
      return run.length;
    },
    acted() {
      run = [];
    },
    looks() {
      return run;
    }
  };
}
