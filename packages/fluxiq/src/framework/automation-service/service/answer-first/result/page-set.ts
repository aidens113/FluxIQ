// A draft read step read a page: the operations table's first row, and its carried pages.
//
// Whatever ran the step (by hand with `add`, a rerun, a run's pass, a saved run's record batch) the page is set at its
// place in the step's version the read was made under: a read under another version than the step holds opens that
// version first (`./step-set.ts`), and a step the ledger has not met is added, or folded into the step that reads its
// list the same way (D2). The page holds the rows the read kept and nothing else (D3); what it left out rides beside
// them as evidence. A carry-on's page is marked `carried`, and a read of its place in this attempt replaces it.
import { automationStudioAnswerFirstResultPlacePage } from "./place-order.ts";
import { automationStudioAnswerFirstResultStepHolder, automationStudioAnswerFirstResultWithStep } from "./holder.ts";
import { automationStudioAnswerFirstResultStepSet } from "./step-set.ts";
import type { AutomationStudioAnswerFirstResultLedger, AutomationStudioAnswerFirstResultPage, AutomationStudioAnswerFirstResultRead, AutomationStudioAnswerFirstResultStepRef } from "./types.ts";

export function automationStudioAnswerFirstResultPageSet(ledger: AutomationStudioAnswerFirstResultLedger, ref: AutomationStudioAnswerFirstResultStepRef, read: AutomationStudioAnswerFirstResultRead): AutomationStudioAnswerFirstResultLedger {
  const set = automationStudioAnswerFirstResultStepSet(ledger, ref, read.version);
  const step = automationStudioAnswerFirstResultStepHolder(set.ledger, set.holderId)!;
  const page: AutomationStudioAnswerFirstResultPage = {
    source: read.source,
    place: read.place,
    kept: read.kept,
    leftOut: read.leftOut,
    where: read.where,
    paging: read.paging,
    carried: read.carried === true,
    seq: set.ledger.seq,
  };
  const pages = automationStudioAnswerFirstResultPlacePage(step.pages, page);
  return { ...automationStudioAnswerFirstResultWithStep(set.ledger, { ...step, pages }), seq: set.ledger.seq + 1 };
}
