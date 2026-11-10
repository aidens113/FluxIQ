// Where the rows of a tool call's answer are, and nowhere else.
//
// A read's answer holds the rows it kept under the domain's declared
// `readRowsKey` (`holder.member`, the web domain's `read.extracted`), and a
// replayed read holds them in `outputs.records`, where Core's capture writes
// a read's rows. That is all this looks at: never the call's input, never a
// `complete` decision's result, never a field a model wrote (answer-first plan
// D9: rows come only from real reads, and a model never writes a row). A
// failed call has no rows, whichever way it says so: a failure record, or an
// answer refused with `ok: false`, as `web.action.rejected.output_not_observed`
// is, which may hold what a read came back with and did not keep.
//
// **Rows a read says its own conditions turned down are not its rows.** A read
// whose `where` conditions kept nothing may answer with the rows they rejected,
// and its own account says so (`extraction.conditions.unfiltered`, beside the
// rows in the answer; the account's contract is Core's, read whole in
// `../../summaries/extraction-summary.ts`). Such a read kept none: it answered,
// and holds no rows. Live run `run-mwaf6gnt-638d90a0` read page 2 of a list
// where every item cost more than the ceiling asked; the read answered with all
// 20 rejected rows, ads and paid shipping among them, and as the latest read they
// became the whole result in place of page 1's 10 right rows, so the judge
// refused it (step 0056).
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../../../../runtime/llm/index.ts";

/** The list a read's answer holds as its rows (each entry as the read gave it), none for a read that answered rows its conditions rejected, or `undefined` when the answer holds no list. */
export function automationStudioAnswerFirstReadRows(answer: AutomationStudioLlmEvidenceToolExecutionResult, readRowsKey: string | undefined): unknown[] | undefined {
  if (answer.failure !== undefined || (isObject(answer.evidence) && answer.evidence.ok === false)) return undefined;
  const live = atKey(answer.evidence, readRowsKey);
  if (live) return answeredRejected(holderOf(answer.evidence, readRowsKey)) ? [] : live;
  const records = answer.outputs?.records;
  if (!Array.isArray(records)) return undefined;
  const outcome = answer.outputs?.result;
  const result = isObject(outcome) ? outcome : undefined;
  const dispatched = result?.result;
  return answeredRejected(result) || answeredRejected(isObject(dispatched) ? dispatched : undefined) ? [] : records;
}

/** Whether a read's own account says its rows are the ones its conditions rejected (header). */
function answeredRejected(read: JsonObject | undefined): boolean {
  const account = read?.extraction;
  const conditions = isObject(account) ? account.conditions : undefined;
  return isObject(conditions) && conditions.unfiltered === true;
}

/** The object that holds a live read's rows (`holder` of `holder.member`). */
function holderOf(evidence: JsonValue, readRowsKey: string | undefined): JsonObject | undefined {
  const holder = readRowsKey?.split(".")[0];
  const held = holder && isObject(evidence) ? evidence[holder] : undefined;
  return isObject(held) ? held : undefined;
}

/** The list under `holder.member` of the evidence. */
function atKey(evidence: JsonValue, readRowsKey: string | undefined): unknown[] | undefined {
  const [holder, member, ...more] = readRowsKey?.split(".") ?? [];
  if (!holder || !member || more.length || !isObject(evidence)) return undefined;
  const held = evidence[holder];
  const rows = isObject(held) ? held[member] : undefined;
  return Array.isArray(rows) ? rows : undefined;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
