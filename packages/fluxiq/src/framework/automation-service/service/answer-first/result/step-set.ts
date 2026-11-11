// A read step is in the draft as this version: the operations table's rows for a new step, a same-list new step
// (D2) and a changed version.
//
// - **A new step** is a new ledger step at version 1, unless an existing step reads the same list (`listKey`, said by
//   both) under the same conditions and fields: then it is folded into that step, and its pages are that step's. A
//   re-detected list under a new handle (run-mwc6ut8u, Saturday R3) therefore never starts a new list.
// - **A changed version** (conditions, fields or list) opens the next version, and the old version's pages leave the
//   result. The change line names them (`./change-line.ts`), from the ledger before and after.
// - **A folded step that now reads differently** is no longer the same list read the same way, so it parts from the
//   step it was folded into and is a step of its own again, with no pages.
// - **A step that had not said its list** takes the key its first page says without a new version, and, where it has
//   read nothing yet, may then fold into a step that reads that list already.
import { automationStudioAnswerFirstResultStepHolder, automationStudioAnswerFirstResultWithStep } from "./holder.ts";
import type { AutomationStudioAnswerFirstResultLedger, AutomationStudioAnswerFirstResultStep, AutomationStudioAnswerFirstResultStepRef, AutomationStudioAnswerFirstResultVersion } from "./types.ts";
import { automationStudioAnswerFirstResultSameReading } from "./version.ts";

/** The ledger with the step set, and the id of the ledger step that now holds its pages. */
export function automationStudioAnswerFirstResultStepSet(
  ledger: AutomationStudioAnswerFirstResultLedger,
  ref: AutomationStudioAnswerFirstResultStepRef,
  version: AutomationStudioAnswerFirstResultVersion,
): { ledger: AutomationStudioAnswerFirstResultLedger; holderId: string } {
  const holder = automationStudioAnswerFirstResultStepHolder(ledger, ref.id);
  if (!holder) return added(ledger, ref, version);
  if (holder.id !== ref.id) {
    if (!automationStudioAnswerFirstResultSameReading(holder.reads, version, "may be unsaid")) {
      const parted: AutomationStudioAnswerFirstResultStep = { ...holder, folded: holder.folded.filter((folded) => folded.id !== ref.id) };
      return added(automationStudioAnswerFirstResultWithStep(ledger, parted), ref, version);
    }
    const moved: AutomationStudioAnswerFirstResultStep = { ...holder, folded: holder.folded.map((folded) => (folded.id === ref.id ? { id: folded.id, position: ref.position } : folded)) };
    return { ledger: automationStudioAnswerFirstResultWithStep(ledger, moved), holderId: holder.id };
  }
  const placed: AutomationStudioAnswerFirstResultStep = { ...holder, position: ref.position, intermediate: ref.intermediate ?? holder.intermediate };
  if (!automationStudioAnswerFirstResultSameReading(holder.reads, version, "may be unsaid")) {
    const next: AutomationStudioAnswerFirstResultStep = { ...placed, version: holder.version + 1, reads: version, pages: [] };
    return { ledger: automationStudioAnswerFirstResultWithStep(ledger, next), holderId: holder.id };
  }
  if (holder.reads.listKey !== undefined || version.listKey === undefined) return { ledger: automationStudioAnswerFirstResultWithStep(ledger, placed), holderId: holder.id };
  const keyed: AutomationStudioAnswerFirstResultStep = { ...placed, reads: { ...holder.reads, listKey: version.listKey } };
  const into = holder.pages.length || holder.folded.length ? undefined : sameListAs(ledger, keyed.reads, holder.id);
  if (!into) return { ledger: automationStudioAnswerFirstResultWithStep(ledger, keyed), holderId: holder.id };
  const without: AutomationStudioAnswerFirstResultLedger = { ...ledger, steps: ledger.steps.filter((step) => step.id !== holder.id) };
  return folded(without, into, ref);
}

function added(ledger: AutomationStudioAnswerFirstResultLedger, ref: AutomationStudioAnswerFirstResultStepRef, version: AutomationStudioAnswerFirstResultVersion): { ledger: AutomationStudioAnswerFirstResultLedger; holderId: string } {
  const into = sameListAs(ledger, version, ref.id);
  if (into) return folded(ledger, into, ref);
  const step: AutomationStudioAnswerFirstResultStep = { id: ref.id, position: ref.position, intermediate: ref.intermediate ?? false, folded: [], version: 1, reads: version, pages: [] };
  return { ledger: { ...ledger, steps: [...ledger.steps, step] }, holderId: ref.id };
}

/** The step that reads `version`'s list the same way, where its list was said (header). */
function sameListAs(ledger: AutomationStudioAnswerFirstResultLedger, version: AutomationStudioAnswerFirstResultVersion, except: string): AutomationStudioAnswerFirstResultStep | undefined {
  return ledger.steps.find((step) => step.id !== except && automationStudioAnswerFirstResultSameReading(step.reads, version, "must be said"));
}

function folded(ledger: AutomationStudioAnswerFirstResultLedger, into: AutomationStudioAnswerFirstResultStep, ref: AutomationStudioAnswerFirstResultStepRef): { ledger: AutomationStudioAnswerFirstResultLedger; holderId: string } {
  const step: AutomationStudioAnswerFirstResultStep = { ...into, folded: [...into.folded, { id: ref.id, position: ref.position }] };
  return { ledger: automationStudioAnswerFirstResultWithStep(ledger, step), holderId: into.id };
}
