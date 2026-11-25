// Which of the reads that worked are the Flow's result.
//
// **Why.** A build reads many lists on the way -- a list looked at, then filtered, then the one that
// was asked for -- and only the read of the asked table is the result (D16). The model's own word wins:
// a read it marked `result` is the result. Otherwise the last read the caller says is the asked table,
// or the last read when the caller names none, is chosen, together with every other read of the same
// list (the host's `reads` code), because one list read in several steps is still one result. The rest
// are `not_the_result`. Run again after every append, so a later, better read moves the result and the
// earlier pick goes back out.
import type { AutomationStudioFlowDraftStep } from "../step.ts";

/** The reads, out of `candidates` (reads that worked, in run order), that make the Flow's result. */
export function automationStudioFlowDraftResultReads(
  candidates: readonly AutomationStudioFlowDraftStep[],
  isAskedTable?: (step: AutomationStudioFlowDraftStep) => boolean
): AutomationStudioFlowDraftStep[] {
  if (candidates.length === 0) return [];
  const named = candidates.filter((step) => step.result === true);
  if (named.length > 0) return named;
  const asked = isAskedTable ? candidates.filter((step) => isAskedTable(step)) : [];
  const chosen = (asked.length > 0 ? asked : candidates).at(-1)!;
  return candidates.filter((step) => step === chosen || (chosen.reads !== undefined && step.reads === chosen.reads));
}
