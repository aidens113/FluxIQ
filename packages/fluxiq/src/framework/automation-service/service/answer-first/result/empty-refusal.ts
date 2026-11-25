// The words a completion is refused with when the request wants rows and the result holds none (design (b)1). It
// says why the result is empty, names every read outside the result that kept rows, and gives the one-edit fix: the
// `result` edit on that read's step, or running the read of the list asked for, which joins the draft as it works
// (t1037: the framework drafts every call that worked, so `take` is no edit). A read is never made the result on the
// model's behalf: which read is the answer is the model's to say. `undefined` when the result
// holds rows. Whether the request wants rows is the caller's to know (`instruction-ask.ts` answers it).
import { automationStudioAnswerFirstResultOutputGroup } from "./output-group.ts";
import { automationStudioAnswerFirstResultWords as words } from "./statement-words.ts";
import type { AutomationStudioAnswerFirstResultLedger } from "./types.ts";

export function automationStudioAnswerFirstResultEmptyRefusal(ledger: AutomationStudioAnswerFirstResultLedger): string | undefined {
  // Steps appending to the output before it are the result too (`./output-group.ts`): rows in any of them are rows.
  const group = automationStudioAnswerFirstResultOutputGroup(ledger);
  if (group.some((step) => words.keptCount(step) > 0)) return undefined;
  const output = group.at(-1);
  const why = !output
    ? (ledger.steps.length ? "every read step in the draft is marked intermediate" : "the draft has no read step")
    : (output.pages.length ? `${words.step(output)} (v${output.version}) kept no rows on ${words.pages(output.pages)}` : `${words.step(output)} (v${output.version}) has read no page yet`);
  const holding = ledger.looks.filter((look) => look.kept.length > 0);
  if (!holding.length) return `The result holds no rows: ${why}. No read outside the draft kept rows either.`;
  const named = holding.map((look) => words.look(look)).join(", ");
  return `The result holds no rows: ${why}. Reads that are not the result kept rows: ${named}. Every read that worked is a step of the draft: amend_draft with change "result" on that read's step makes it the result, with no new act; or run the read of the list asked for, and it joins the draft.`;
}
