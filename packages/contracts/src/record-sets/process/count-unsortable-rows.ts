// How many rows a sort could not read by at least one of its keys: what a page
// reports beside a sorted answer, so a sort over a column the page states as
// prose shows as one rather than as page order that happened to be right. Each
// key reads as `sortAutomationStudioRecordRows` reads it, an `auto` kind
// decided over these same rows.

import { cellOf } from "./cell-text.ts";
import { automationStudioRecordAutoSortKind, readAutomationStudioRecordSortValue } from "./sort-value.ts";
import type { AutomationStudioRecordSortKey } from "./types.ts";

/** The rows with at least one key whose value is missing, blank, or not of the key's kind. `now` anchors relative dates. */
export function countAutomationStudioRecordUnsortableRows(
  rows: readonly { readonly values: Readonly<Record<string, unknown>> }[],
  keys: readonly AutomationStudioRecordSortKey[],
  now: number
): number {
  if (keys.length === 0) return 0;
  const kinds = keys.map((key) =>
    key.as === undefined || key.as === "auto" ? automationStudioRecordAutoSortKind(rows.map((row) => cellOf(row.values, key.field)), now) : key.as
  );
  return rows.filter((row) => keys.some((key, position) => readAutomationStudioRecordSortValue(cellOf(row.values, key.field), kinds[position]!, now) === undefined)).length;
}
