import type { AutomationStudioResultReadAccount, AutomationStudioRunResultSummary } from "../contracts/index.ts";
import { automationStudioResultReadObservedEnd } from "../read-account/index.ts";

/**
 * Whether the run's own record shows an empty answer is the honest one
 * (`./index.ts`): a read whose list it saw end (`automationStudioResultReadObservedEnd`)
 * kept nothing, its conditions answering with no unfiltered rows in their
 * place; or every read saw its list end and an answer the run made of their
 * rows kept none of them (a record set's processing, or a build test's
 * would-be store). A read that never looked, or stopped before its list ended,
 * shows nothing about what was not read.
 */
export function automationStudioResultHonestlyEmpty(summary: AutomationStudioRunResultSummary): boolean {
  const reads = summary.reads ?? [];
  if (reads.some((read) => ended(read) && read.kept === 0 && read.unfiltered !== true)) return true;
  if (!reads.length || !reads.every(ended)) return false;
  return summary.recordSets.some((set) => set.processing?.keptNone === true && set.processing.collected > 0)
    || (summary.buildTest?.stores ?? []).some((store) => store.keptNone === true && store.collected > 0);
}

function ended(read: AutomationStudioResultReadAccount): boolean {
  return automationStudioResultReadObservedEnd(read);
}
