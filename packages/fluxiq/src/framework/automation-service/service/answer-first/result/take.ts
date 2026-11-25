// A look the draft now holds as a step: an earlier read that was a look became a step of the draft, with no new
// act (the framework drafts every read that worked, t1037). Its page is recorded as the step's, from the rows that real read kept (design D9), and it is no longer a look.
// A step that reads a list some step already reads the same way folds into it (D2), as any new step does.
//
// A call that is not a look (never read, or already in the draft) takes nothing, and the ledger stays as it was;
// `./port.ts` answers that in words.
import { automationStudioAnswerFirstResultPageSet } from "./page-set.ts";
import type { AutomationStudioAnswerFirstResultLedger, AutomationStudioAnswerFirstResultStepRef } from "./types.ts";

export function automationStudioAnswerFirstResultTake(ledger: AutomationStudioAnswerFirstResultLedger, source: string, ref: AutomationStudioAnswerFirstResultStepRef): AutomationStudioAnswerFirstResultLedger {
  const look = ledger.looks.find((each) => each.source === source);
  if (!look) return ledger;
  const kept: AutomationStudioAnswerFirstResultLedger = {
    ...ledger,
    looks: ledger.looks.filter((each) => each.source !== source),
    taken: [...ledger.taken, { source, stepId: ref.id }],
  };
  return automationStudioAnswerFirstResultPageSet(kept, ref, look);
}
