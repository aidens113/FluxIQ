// A read step that comes back into the draft brings back the pages it read before it left (t1085).
//
// **The failure this closes.** Live run `run-mwz2jc4w-0c207128`, attempt 2: the model read the auction list at 0057 and
// the read became draft step 14 with page=1's 26 rows. The framework's draft left it out (`not_the_result`), so the
// ledger dropped it and its page left the result (`../result/dropped.ts`). At 0058 the model kept 14 and made it the
// result, and the step came back as a new read step that "has read no page yet": the 26 rows its read had taken were
// not credited to it, so the model rebuilt and ran its paging loop twice to read page 1 again ($0.39).
//
// **The rule.** A page that left the ledger stays with the left reads (`./left-reads.ts`) under the step and version it
// was read under. When the draft holds that step again, reading the same way (`../result/version.ts`), each such page is
// set on it again: the rows that read took are its rows. Not a page another step has read since at the same address of
// the same list (t1074): the newer reading stands there.
import { automationStudioAnswerFirstResultSameReading, type AutomationStudioAnswerFirstResultEvent, type AutomationStudioAnswerFirstResultLedger, type AutomationStudioAnswerFirstResultStepRef, type AutomationStudioAnswerFirstResultVersion } from "../result/index.ts";
import type { AutomationStudioAnswerFirstLeftRead } from "./left-reads.ts";

/** The page events that give a draft read step back the pages it read before it left the ledger; none where it never left. */
export function automationStudioAnswerFirstReturnedPages(
  ledger: AutomationStudioAnswerFirstResultLedger,
  left: readonly AutomationStudioAnswerFirstLeftRead[],
  ref: AutomationStudioAnswerFirstResultStepRef,
  version: AutomationStudioAnswerFirstResultVersion
): AutomationStudioAnswerFirstResultEvent[] {
  if (ledger.steps.some((step) => step.id === ref.id || step.folded.some((folded) => folded.id === ref.id))) return [];
  return left
    .filter((gone) => gone.step.id === ref.id && automationStudioAnswerFirstResultSameReading(gone.step.reads, version, "may be unsaid") && !readSince(ledger, gone))
    .map((gone) => ({
      kind: "page" as const,
      step: ref,
      read: { source: gone.page.source, version: gone.step.reads, place: gone.page.place, spot: gone.page.spot, kept: gone.page.kept, ...(gone.page.invalidCount === undefined ? {} : { invalidCount: gone.page.invalidCount }), leftOut: gone.page.leftOut, where: gone.page.where, paging: gone.page.paging }
    }));
}

/** Whether a step of the ledger holds a later page of the same list at the same address (header). */
function readSince(ledger: AutomationStudioAnswerFirstResultLedger, gone: AutomationStudioAnswerFirstLeftRead): boolean {
  const listKey = gone.step.reads.listKey;
  if (listKey === undefined || gone.page.where === undefined) return false;
  return ledger.steps.some((step) => step.reads.listKey === listKey && step.pages.some((page) => page.seq > gone.page.seq && page.where === gone.page.where && (page.place === undefined || gone.page.place === undefined || page.place === gone.page.place)));
}
