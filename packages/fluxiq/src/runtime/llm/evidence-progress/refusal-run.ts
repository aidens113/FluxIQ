// Decisions in a row refused, or answered as changing nothing, for one reason.
//
// **Why (week report W2, 2026-10-06).** Refusal churn was the commonest way a
// build spent its purse: 23 runs, 27 of 38 decisions in one, 35 of 55 in
// another. The repeat guard (`../repeat-guard/`) stops only the identical
// decision on the same page or draft, and the no-progress guard
// (`./no-progress.ts`) redirects for a long while before it stops. A model
// that varies what it sends -- `keep` on another step each time, a refused
// press on another control, a rerun with a near-identical condition -- went
// on until the purse ran out. The user's rule: when refusals of one kind
// repeat three decisions in a row, end the round and test what exists.
//
// The kind is whatever the decision's caller says it is (`../decision-handlers/refusal-run.ts`):
// one decision counts once, a decision of another kind starts a new run, and
// anything decided between two refusals breaks the run, as in the repeat
// guard's `refusedAgain`.

/** Decisions in a row refused for one kind after which the round ends and the Flow so far is tested. */
export const AUTOMATION_STUDIO_LLM_EVIDENCE_MAX_SAME_REFUSALS_IN_A_ROW = 3;

export type AutomationStudioLlmEvidenceRefusalRun = {
  /** Decision `iteration` was refused, or changed nothing, for `kind`; answers how many decisions in a row have been, this one included. */
  refused(iteration: number, kind: string): number;
};

export function automationStudioLlmEvidenceRefusalRun(): AutomationStudioLlmEvidenceRefusalRun {
  let last = Number.NEGATIVE_INFINITY;
  let lastKind: string | undefined;
  let inARow = 0;
  return {
    refused(iteration, kind) {
      if (iteration === last) return inARow;
      inARow = iteration === last + 1 && kind === lastKind ? inARow + 1 : 1;
      last = iteration;
      lastKind = kind;
      return inARow;
    }
  };
}
