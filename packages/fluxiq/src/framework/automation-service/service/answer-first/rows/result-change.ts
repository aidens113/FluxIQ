// What a read tells the model when it changed which rows the result holds in a way the read alone
// does not show (live run run-mwafor01-bb471f52, cause 1d).
//
// **Why the read has to say it.** The result is the latest read's list (`./result-dataset.ts`), and a
// read asked another way is a list of its own (`./dataset-of-read.ts`), which is right. But the model
// saw only the read's own rows. On that run the Flow's run had read both pages of a list into the
// result, 16 rows (steps 0076, 0078); the model then read page 2 by hand under other words (0094),
// which started a new list and made its 5 rows the whole result. Nothing said so: the model's last
// word on the result was a refusal that showed 12 rows, it completed believing both pages were in,
// and it spent the rest of the attempt repairing the Flow instead of the result until the loop
// detector stopped it. The same holds for a read that starts its own list over (`./list-after-read.ts`):
// rows the model read earlier leave the result with nothing on the page to show it.
//
// So the read that did it carries Core's note, beside what the domain answered, under
// `resultList`: what the result holds now (its rows and the reads it came from) and what it held just
// before (rows, columns, reads, and the call that last read it), with what to do. Only these two
// changes are told; a read that carried its list on, or left the result where it was, adds nothing.
// The words name no site, task or row: counts, a list's own columns and the call ids are the model's own.
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../../../../runtime/llm/index.ts";
import type { AutomationStudioAnswerFirstReadPage } from "./list-page.ts";

/** How the result changed under one read, as the row sink saw it (`./row-sink.ts`). */
export type AutomationStudioAnswerFirstResultChange = {
  /** `other_list`: the result is now this read's list, in place of another; `started_over`: this read's list dropped what it held. */
  kind: "other_list" | "started_over";
  /** The result after the read: its rows, and the reads they came from. */
  now: { rows: number; pages: AutomationStudioAnswerFirstReadPage[] };
  /** The result just before it: its rows, its columns, the reads they came from, and the call that last stored rows in it, where a call did. */
  before: { rows: number; columns: string[]; pages: AutomationStudioAnswerFirstReadPage[]; lastReadBy?: string };
};

const OTHER_LIST = "Core's note on the result, not on the page: this read was not asked the way the list the result held was, so its rows are a list of their own, and the result is now this list alone (rows, from the reads in pages). The list it replaced (replaced) is no longer the result: only this list's rows are in it. A read adds to a list only when it is asked as that list's reads were: the same record output name and columns, or, with no name, the same node, the same arguments apart from the page, the same columns and the same view of the site. So read every other page that holds rows the person asked for exactly as this read was asked; or, where the replaced list was the right one, read it again as it was asked.";
const STARTED_OVER = "Core's note on the result, not on the page: this read started its list over instead of adding to it (a page the list held read again with its rows moved, a read that said replace, another view of the site, or rows a sort or a filter changed), so the result now holds this read's rows alone (rows, from the reads in pages), and the rows the list held before (replaced) that this read did not return are no longer in it. Read again, exactly as this read was asked, every other page that holds rows the person asked for.";

/** The answer with Core's note on the result beside what the domain answered (header). */
export function automationStudioAnswerFirstResultChangeTold(answer: AutomationStudioLlmEvidenceToolExecutionResult, change: AutomationStudioAnswerFirstResultChange): AutomationStudioLlmEvidenceToolExecutionResult {
  const note: JsonObject = {
    code: change.kind === "other_list" ? "answer_first.result_list_replaced" : "answer_first.result_list_started_over",
    rows: change.now.rows,
    pages: change.now.pages.map(shown),
    replaced: { rows: change.before.rows, columns: [...change.before.columns], pages: change.before.pages.map(shown), ...(change.before.lastReadBy !== undefined ? { lastReadBy: change.before.lastReadBy } : {}) },
    instruction: change.kind === "other_list" ? OTHER_LIST : STARTED_OVER
  };
  const evidence: JsonValue = isObject(answer.evidence) ? { ...answer.evidence, resultList: note } : { answered: answer.evidence, resultList: note };
  return { ...answer, evidence };
}

/** A read as the note shows it: where in the list, where that was said, and how many rows it kept. The view's address is the read's own, already shown. */
function shown(page: AutomationStudioAnswerFirstReadPage): JsonObject {
  return { ...(page.place !== undefined ? { place: page.place } : {}), kept: page.kept };
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
