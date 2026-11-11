// The attempt's one result (`AttemptResult`, design (b)1 in the web extension's
// `docs/working/mvp-launch-plan/reports/result-evidence-design.md`): which read rows are the answer.
//
// The result is the draft's read steps only (lead decision D1): the output step's current version, each page as last
// read at its place. A read outside the draft is a look and never changes it; `take` makes a look a step. There is no
// row-count, row-overlap or "latest read wins" rule, and no cut or cap: the operations below are the only ways the
// result changes, one per row of the design's table, and every statement of it (`./header.ts`, `./change-line.ts`)
// is worked out from the ledger, never kept beside it.
//
// The ledger is plain data and every operation returns a new one, so a call's change line is the difference between
// the ledger before it and after it (`./port.ts`). A draft that never assembles still has a result: nothing here
// reads the assembled Flow.
import { automationStudioAnswerFirstResultPageSet } from "./page-set.ts";
import { automationStudioAnswerFirstResultStepHolder, automationStudioAnswerFirstResultWithStep } from "./holder.ts";
import { automationStudioAnswerFirstResultDropped } from "./dropped.ts";
import { automationStudioAnswerFirstResultStepSet } from "./step-set.ts";
import { automationStudioAnswerFirstResultTake } from "./take.ts";
import type { AutomationStudioAnswerFirstAnswerContract, AutomationStudioAnswerFirstResultEvent, AutomationStudioAnswerFirstResultLedger, AutomationStudioAnswerFirstResultPaging } from "./types.ts";

/** A ledger with no read step and no look, under the request's answer contract (`./answer-contract.ts`). */
export function automationStudioAnswerFirstResultLedger(contract: AutomationStudioAnswerFirstAnswerContract): AutomationStudioAnswerFirstResultLedger {
  return { contract, steps: [], looks: [], taken: [], seq: 0 };
}

/** The ledger after one event. */
export function automationStudioAnswerFirstResultApply(ledger: AutomationStudioAnswerFirstResultLedger, event: AutomationStudioAnswerFirstResultEvent): AutomationStudioAnswerFirstResultLedger {
  switch (event.kind) {
    case "page":
      return automationStudioAnswerFirstResultPageSet(ledger, event.step, event.read);
    case "step":
      return automationStudioAnswerFirstResultStepSet(ledger, event.step, event.version).ledger;
    case "paging":
      return pagingSaid(ledger, event.stepId, event.paging);
    case "dropped":
      return automationStudioAnswerFirstResultDropped(ledger, event.stepId);
    case "look":
      return { ...ledger, looks: [...ledger.looks.filter((look) => look.source !== event.read.source), event.read] };
    case "take":
      return automationStudioAnswerFirstResultTake(ledger, event.source, event.step);
  }
}

/** What the pager said after the step's most recently read page, said after that page was recorded. */
function pagingSaid(ledger: AutomationStudioAnswerFirstResultLedger, stepId: string, paging: AutomationStudioAnswerFirstResultPaging): AutomationStudioAnswerFirstResultLedger {
  const step = automationStudioAnswerFirstResultStepHolder(ledger, stepId);
  if (!step?.pages.length) return ledger;
  const latest = Math.max(...step.pages.map((page) => page.seq));
  const pages = step.pages.map((page) => (page.seq === latest ? { ...page, paging } : page));
  return automationStudioAnswerFirstResultWithStep(ledger, { ...step, pages });
}
