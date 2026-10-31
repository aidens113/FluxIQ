// The marks a read's client found on the rows it left out (t810, framework plan P5b).
//
// A judge that says a left-out row "was asked for" (a post "from a group the
// person belongs to") has only the row's cells to be held to. A feed's suggested
// post carries a `Join group` button the person never pressed: the client read
// that control on the item and sends it, beside the row, as an `outside` mark
// (`said`: the control's words as the page shows them; `entity`: the linked
// name beside it, where clear). Core never knows the client's words; it keeps
// the shape and carries the marks to the read account (`result-verification/
// read-account/`).
//
// **Strict, and a bad member costs the marks, not the summary.** The marks only
// add evidence; a read whose rows and counts are sound must still be accounted
// for when a newer or buggy client sends marks this Core cannot read. So any
// member that is not exactly one list per condition, one entry per sampled row,
// each `null` or a non-empty list of `{ kind: "outside", said, entity? }` with
// non-empty text and no other key, drops every mark and nothing else. (Every
// other member of the summary drops the whole summary; these are not counts the
// verdicts depend on.)

import type { JsonObject } from "../../../../../core/index.ts";
import { isJsonRecord } from "../json-values.ts";

type Marks = JsonObject[] | null;

/** One mark, copied, or `undefined` unless it is exactly `{ kind: "outside", said, entity? }` with text. */
function markValue(value: unknown): JsonObject | undefined {
  if (!isJsonRecord(value) || value.kind !== "outside" || typeof value.said !== "string" || value.said.trim() === "") return undefined;
  if (Object.keys(value).some((key) => key !== "kind" && key !== "said" && key !== "entity")) return undefined;
  if (value.entity !== undefined && (typeof value.entity !== "string" || value.entity.trim() === "")) return undefined;
  return { kind: "outside", said: value.said, ...(value.entity === undefined ? {} : { entity: value.entity }) };
}

/**
 * The marks aligned with the sampled rows -- one list per condition, one entry
 * per row -- or `undefined` for anything else (header).
 */
export function rejectedMarkLists(value: unknown, samples: unknown): Marks[][] | undefined {
  if (!Array.isArray(value) || !Array.isArray(samples) || value.length !== samples.length) return undefined;
  const lists: Marks[][] = [];
  for (const [index, entries] of value.entries()) {
    const rows = samples[index];
    if (!Array.isArray(entries) || !Array.isArray(rows) || entries.length !== rows.length) return undefined;
    const list: Marks[] = [];
    for (const entry of entries) {
      if (entry === null) {
        list.push(null);
        continue;
      }
      if (!Array.isArray(entry) || entry.length === 0) return undefined;
      const marks = entry.map(markValue);
      if (marks.some((mark) => mark === undefined)) return undefined;
      list.push(marks as JsonObject[]);
    }
    lists.push(list);
  }
  return lists;
}

/**
 * Per condition, the marks of its alone rows that `keep` says an account keeps
 * (a row with no label is not kept, so its marks go with it), in the rows'
 * order; `undefined` where no kept row carries a mark.
 */
export function aloneMarkLists(lists: Marks[][], leads: readonly number[], keep: (condition: number, row: number) => boolean): Marks[][] | undefined {
  const out = lists.map((marks, condition) => marks.slice(0, leads[condition] ?? 0).filter((_entry, row) => keep(condition, row)));
  return out.some((marks) => marks.some((entry) => entry !== null)) ? out : undefined;
}
