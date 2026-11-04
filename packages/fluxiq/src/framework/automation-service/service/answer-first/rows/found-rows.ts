// Where the rows of a tool call's answer are, and nowhere else.
//
// A read's answer holds the rows it kept under the domain's declared
// `readRowsKey` (`holder.member`, the web domain's `read.extracted`), and a
// replayed read holds them in `outputs.records`, where Core's capture writes
// a read's rows. That is all this looks at: never the call's input, never a
// `complete` decision's result, never a field a model wrote (answer-first plan
// D9: rows come only from real reads, and a model never writes a row). A
// failed call has no rows.
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../../../../runtime/llm/index.ts";

/** The list a read's answer holds as its rows (each entry as the read gave it), or `undefined` when the answer holds none. */
export function automationStudioAnswerFirstReadRows(answer: AutomationStudioLlmEvidenceToolExecutionResult, readRowsKey: string | undefined): unknown[] | undefined {
  if (answer.failure !== undefined) return undefined;
  const live = atKey(answer.evidence, readRowsKey);
  if (live) return live;
  const records = answer.outputs?.records;
  return Array.isArray(records) ? records : undefined;
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
