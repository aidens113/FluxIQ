// The columns the instruction names that the stored answer does not carry.
//
// The build declares an instruction's named columns as an extraction's schema,
// and a name no field reads was a warning on the plan that nothing showed
// (F35, `flow-bootstrap/authoring/instruction-record-columns.ts`). A judge then
// compared the request with the stored columns by reading both, and could miss
// it the same way. So the summary the judge is shown says it, in the sentence
// and by the matcher the build uses -- never a second one -- against every
// stored column. Information only: nothing here refuses, and the names are the
// instruction's own, never a value from the page.

import type { AutomationStudioFlowInstruction } from "../../../model/index.ts";
import { automationStudioFlowBootstrapUnreadColumnsSentence } from "../../flow-bootstrap/index.ts";
import type { AutomationStudioRunResultSummary } from "../contracts.ts";

/**
 * The summary with `instructionColumnsUnread` set when the instruction names a
 * column no stored column reads, and unchanged otherwise: no named column, no
 * stored column, or a column list cut to fit, which cannot say what is absent.
 */
export function automationStudioResultSummaryWithUnreadColumns(
  summary: AutomationStudioRunResultSummary,
  instructions: readonly Pick<AutomationStudioFlowInstruction, "title" | "body">[]
): AutomationStudioRunResultSummary {
  if (summary.recordSets.some((set) => set.columnsWithheld)) return summary;
  // The instruction as the build read it (`service.ts`, `bootstrapInstructionText`).
  const instructionText = instructions.map((instruction) => `${instruction.title}\n${instruction.body}`).join("\n");
  const fieldKeys = [...new Set(summary.recordSets.flatMap((set) => set.columns))];
  const sentence = automationStudioFlowBootstrapUnreadColumnsSentence({ instructionText, fieldKeys });
  return sentence ? { ...summary, instructionColumnsUnread: sentence } : summary;
}
