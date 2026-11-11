// The words a completion is refused with when the request wants rows and the result holds none (design (b)1). It
// says why the result is empty, names every look that kept rows, and gives the one-call fix, `take`. A look is never
// made the result on the model's behalf: which read is the answer is the model's to say. `undefined` when the result
// holds rows. Whether the request wants rows is the caller's to know (`instruction-ask.ts` answers it).
import { automationStudioAnswerFirstResultOutputStep } from "./output-step.ts";
import { automationStudioAnswerFirstResultWords as words } from "./statement-words.ts";
import type { AutomationStudioAnswerFirstResultLedger } from "./types.ts";

export function automationStudioAnswerFirstResultEmptyRefusal(ledger: AutomationStudioAnswerFirstResultLedger): string | undefined {
  const output = automationStudioAnswerFirstResultOutputStep(ledger);
  if (output && words.keptCount(output) > 0) return undefined;
  const why = !output
    ? (ledger.steps.length ? "every read step in the draft is marked intermediate" : "the draft has no read step")
    : (output.pages.length ? `${words.step(output)} (v${output.version}) kept no rows on ${words.pages(output.pages)}` : `${words.step(output)} (v${output.version}) has read no page yet`);
  const holding = ledger.looks.filter((look) => look.kept.length > 0);
  if (!holding.length) return `The result holds no rows: ${why}. No read outside the draft kept rows either.`;
  const named = holding.map((look) => words.look(look)).join(", ");
  return `The result holds no rows: ${why}. Reads outside the draft kept rows, and they are not the result: ${named}. A read is the result only as a draft step: amend_draft with change "take" and the read's call id makes it one, with no new act.`;
}
