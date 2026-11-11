// A read step left the draft: its pages leave the result, and the change line says so (`./change-line.ts`).
//
// A step others were folded into (D2) still has a draft step reading its list: the first folded step holds the pages
// on, under its own id and position. A folded step that leaves takes nothing with it. The draft renumbers the steps
// after the one that left, and so does the ledger.
import { automationStudioAnswerFirstResultStepHolder, automationStudioAnswerFirstResultWithStep } from "./holder.ts";
import type { AutomationStudioAnswerFirstResultLedger, AutomationStudioAnswerFirstResultStep } from "./types.ts";

export function automationStudioAnswerFirstResultDropped(ledger: AutomationStudioAnswerFirstResultLedger, stepId: string): AutomationStudioAnswerFirstResultLedger {
  const holder = automationStudioAnswerFirstResultStepHolder(ledger, stepId);
  if (!holder) return ledger;
  const gone = holder.id === stepId ? holder.position : holder.folded.find((folded) => folded.id === stepId)!.position;
  let next: AutomationStudioAnswerFirstResultLedger;
  if (holder.id !== stepId) {
    next = automationStudioAnswerFirstResultWithStep(ledger, { ...holder, folded: holder.folded.filter((folded) => folded.id !== stepId) });
  } else if (holder.folded.length) {
    const [heir, ...rest] = holder.folded;
    const step: AutomationStudioAnswerFirstResultStep = { ...holder, id: heir!.id, position: heir!.position, folded: rest };
    next = { ...ledger, steps: ledger.steps.map((each) => (each.id === holder.id ? step : each)) };
  } else {
    next = { ...ledger, steps: ledger.steps.filter((each) => each.id !== stepId) };
  }
  const renumbered = (position: number) => (position > gone ? position - 1 : position);
  return {
    ...next,
    steps: next.steps.map((step) => ({ ...step, position: renumbered(step.position), folded: step.folded.map((folded) => ({ id: folded.id, position: renumbered(folded.position) })) })),
  };
}
