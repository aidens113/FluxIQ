// The one line a look's answer always carries: the read was not a draft step, so the result is unchanged, and what the
// result is. Run-mwaudvnh and run-mwafor01 left the model to infer which read was the result; this says it directly.
// Where the result holds no rows, the line also says how a look becomes the result: `take`, with this call's id.
import { automationStudioAnswerFirstResultOutputStep } from "./output-step.ts";
import { automationStudioAnswerFirstResultWords as words } from "./statement-words.ts";
import type { AutomationStudioAnswerFirstResultLedger } from "./types.ts";

export function automationStudioAnswerFirstResultLookLine(ledger: AutomationStudioAnswerFirstResultLedger, source: string): string {
  const output = automationStudioAnswerFirstResultOutputStep(ledger);
  const rows = output ? words.keptCount(output) : 0;
  const stands = output ? `${words.step(output)}, ${words.rows(rows)}` : "no read step in the draft, so no rows";
  const take = rows ? "" : `; a read is the result only as a draft step: amend_draft with change "take" and call "${source}" makes this one a step, with no new act`;
  return `a look: the result is unchanged (${stands})${take}.`;
}
