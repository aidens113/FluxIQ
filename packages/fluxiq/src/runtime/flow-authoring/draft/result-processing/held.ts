// The Flow's result processing, held on its draft beside the steps (t970).
//
// **Why it is not a step.** A step acts on the page or reads it; processing acts
// on rows already read: which are kept, in what order, how many, which columns
// show. Run `run-mwodpw10-3d5748ab` changed one condition on the result's read
// three times, and each change ran the read again and then the whole Flow over
// five pages, although every row it needed was already collected; run
// `run-mwojyaub-a76ac16e` spent $5 and never dropped a promoted row the read
// had collected with its mark. So the processing is the Flow's own, set by
// `core.set_result_processing` (`runtime/llm/node-tools/result/`) at any point
// and changed as often as needed, and assembly writes it onto every record
// output it applies to (`../../bootstrap/authoring/result-processing/plan.ts`), so the
// saved Flow's run applies it at its end with no model call.
//
// **Which outputs it applies to.** A declaration is held under the dataset id
// of the output it shapes, or under `AUTOMATION_STUDIO_FLOW_DRAFT_RESULT_KEY`,
// which is the Flow's result: every record output that is not a working read
// (`purpose: "intermediate"`) and names no dataset a declaration of its own is
// held for. A declaration is the contract's `AutomationStudioRecordProcessing`,
// read against each output's schema where it is written.

import type { AutomationStudioRecordProcessing } from "@fluxiq/contracts/automation";

/** The key a declaration for the Flow's whole result is held under (header). */
export const AUTOMATION_STUDIO_FLOW_DRAFT_RESULT_KEY = "result";

/** The declarations a draft holds, by dataset id or `AUTOMATION_STUDIO_FLOW_DRAFT_RESULT_KEY`. */
export type AutomationStudioFlowDraftResultProcessing = Readonly<Record<string, AutomationStudioRecordProcessing>>;

/** The held declarations with `process` held under `key`, or the declaration under `key` cleared when `process` is null; a new object. */
export function automationStudioFlowDraftWithResultProcessing(
  held: AutomationStudioFlowDraftResultProcessing | undefined,
  key: string,
  process: AutomationStudioRecordProcessing | null
): AutomationStudioFlowDraftResultProcessing {
  const next: Record<string, AutomationStudioRecordProcessing> = { ...held };
  if (process === null) delete next[key];
  else next[key] = process;
  return next;
}

/** The declaration that applies to a record output, by its dataset id and purpose (header), or `undefined`. */
export function automationStudioFlowDraftResultProcessingFor(
  held: AutomationStudioFlowDraftResultProcessing | undefined,
  output: { datasetId: string; purpose?: string | undefined }
): AutomationStudioRecordProcessing | undefined {
  if (held === undefined) return undefined;
  if (Object.hasOwn(held, output.datasetId)) return held[output.datasetId];
  if (output.purpose === "intermediate") return undefined;
  return Object.hasOwn(held, AUTOMATION_STUDIO_FLOW_DRAFT_RESULT_KEY) ? held[AUTOMATION_STUDIO_FLOW_DRAFT_RESULT_KEY] : undefined;
}
