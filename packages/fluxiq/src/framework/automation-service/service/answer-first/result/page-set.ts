// A draft read step read a page: the operations table's first row, and its carried pages.
//
// Whatever ran the step (by hand with `add`, a rerun, a run's pass, a saved run's record batch) the page is set at its
// place in the step's version the read was made under: a read under another version than the step holds opens that
// version first (`./step-set.ts`), and a step the ledger has not met is added, or folded into the step that reads its
// list the same way (D2). The page holds the rows the read kept and nothing else (D3); what it left out rides beside
// them as evidence. A carry-on's page is marked `carried`, and a read of its place in this attempt replaces it.
//
// **A read of a list at an address supersedes another step's page of that list there (t1074).** Bigbox run
// run-mwynbry2-f3c88dc7 (attempt 2): the saved Flow's read step held the cart with a stale quantity, the model read the
// cart again by hand and made that read a step (0076-0078), and the answer held both readings, each line twice (judge
// 0080). Two draft steps reading one list (`listKey`) at one address (`where`, query included, so a page reached by its
// address is another address) read the same rows: the later page stands and the earlier step's page of that address
// leaves the answer. A place the pager named on both sides must agree; a step's own pages follow the place rule above.
import { automationStudioAnswerFirstResultPlacePage } from "./place-order.ts";
import { automationStudioAnswerFirstResultStepHolder, automationStudioAnswerFirstResultWithStep } from "./holder.ts";
import { automationStudioAnswerFirstResultStepSet } from "./step-set.ts";
import type { AutomationStudioAnswerFirstResultLedger, AutomationStudioAnswerFirstResultPage, AutomationStudioAnswerFirstResultRead, AutomationStudioAnswerFirstResultStep, AutomationStudioAnswerFirstResultStepRef } from "./types.ts";

export function automationStudioAnswerFirstResultPageSet(ledger: AutomationStudioAnswerFirstResultLedger, ref: AutomationStudioAnswerFirstResultStepRef, read: AutomationStudioAnswerFirstResultRead): AutomationStudioAnswerFirstResultLedger {
  const set = automationStudioAnswerFirstResultStepSet(ledger, ref, read.version);
  const step = automationStudioAnswerFirstResultStepHolder(set.ledger, set.holderId)!;
  const page: AutomationStudioAnswerFirstResultPage = {
    source: read.source,
    place: read.place,
    spot: read.spot,
    kept: read.kept,
    ...(read.invalidCount === undefined ? {} : { invalidCount: read.invalidCount }),
    leftOut: read.leftOut,
    where: read.where,
    paging: read.paging,
    carried: read.carried === true,
    seq: set.ledger.seq,
  };
  const pages = automationStudioAnswerFirstResultPlacePage(step.pages, page);
  const placed = automationStudioAnswerFirstResultWithStep(set.ledger, { ...step, pages });
  return { ...superseded(placed, step, page), seq: set.ledger.seq + 1 };
}

/** The ledger with every other step's page of the same list at the same address left out (header, t1074). */
function superseded(ledger: AutomationStudioAnswerFirstResultLedger, holder: AutomationStudioAnswerFirstResultStep, page: AutomationStudioAnswerFirstResultPage): AutomationStudioAnswerFirstResultLedger {
  const listKey = holder.reads.listKey;
  if (listKey === undefined || page.where === undefined) return ledger;
  const same = (other: AutomationStudioAnswerFirstResultPage): boolean => other.where === page.where && (other.place === undefined || page.place === undefined || other.place === page.place);
  return { ...ledger, steps: ledger.steps.map((each) => (each.id === holder.id || each.reads.listKey !== listKey || !each.pages.some(same) ? each : { ...each, pages: each.pages.filter((other) => !same(other)) })) };
}
