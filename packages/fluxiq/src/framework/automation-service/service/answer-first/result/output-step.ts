// The output step: the last read step in the draft that the model did not mark `purpose: intermediate`. Its current
// version's pages are the result; every other read step is a working read, and the header says so (`./header.ts`).
// A step others were folded into stands where the last of them stands in the draft.
import type { AutomationStudioAnswerFirstResultLedger, AutomationStudioAnswerFirstResultStep } from "./types.ts";

export function automationStudioAnswerFirstResultOutputStep(ledger: AutomationStudioAnswerFirstResultLedger): AutomationStudioAnswerFirstResultStep | undefined {
  let output: AutomationStudioAnswerFirstResultStep | undefined;
  let outputAt = -Infinity;
  for (const step of ledger.steps) {
    if (step.intermediate) continue;
    const at = Math.max(step.position, ...step.folded.map((folded) => folded.position));
    if (at > outputAt) {
      output = step;
      outputAt = at;
    }
  }
  return output;
}
