// The digest a completion is compared by. A judge's no or unsure is told back to
// the model, and a completion over the same evidence is refused without another
// call (design, "Judged once on a digest"): new evidence is what it needs.
//
// So only what the judge would be shown counts. Rows are read by their declared
// columns, because a read mints fresh handles on a row each time, and a row read
// again is the same evidence. Row and act order count: both are evidence.
//
// **The final data and the evidence that bears on it, not every call (t963).** The judge is
// shown the trail, every call the attempt made (`../run-trail/`), but the digest leaves it
// out: a throwaway look between two identical completions would otherwise make the second
// new evidence, judge it again for nothing, and reset the count the loop handling climbs on
// (`SVC/answer-first/loop-signal/completion-refused-again.ts`). What in the trail bears on
// the result reaches the digest through the result itself: the rows and their order, the
// reads' accounts with their conditions, where they read and what they left out
// (`readPages`), the acts, the end view and witnesses, and every look after the first act
// (`looked`). So a read that returns other rows, other conditions, an act that lands, or a
// look after an act that finds something new is new evidence; a look that changes none of
// them is not.

import type { JsonObject } from "../../../core/index.ts";
import { automationStudioFlowLessJsonDigest } from "./json-digest.ts";
import type { AutomationStudioFlowLessSummary } from "./types.ts";

/** Same evidence, same digest, whatever order any object's keys were written in. */
export function automationStudioFlowLessSummaryDigest(summary: AutomationStudioFlowLessSummary): string {
  const { trail: _readThroughTheResult, ...bearing } = summary;
  const evidence = bearing.rows ? { ...bearing, rows: { ...bearing.rows, rows: bearing.rows.rows.map((row) => declared(row, bearing.rows?.columns ?? [])) } } : bearing;
  return automationStudioFlowLessJsonDigest(evidence);
}

function declared(row: JsonObject, columns: readonly { id: string }[]): JsonObject {
  if (columns.length === 0) return row;
  return Object.fromEntries(columns.filter((column) => Object.hasOwn(row, column.id)).map((column) => [column.id, row[column.id]!]));
}
