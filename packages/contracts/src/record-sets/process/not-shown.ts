// Whether a row's cell is a definite "not shown" (t993).
//
// Run t990's job-board read collected an "Easily apply" tag that only some
// items carry. Automatic processing read every item without it as missing
// evidence and withheld the whole answer, though re-reading cannot produce a
// value the page does not show, while `is: present` already read the same
// absence as a definite no. So in automatic processing an absent or blank cell
// of a field the row's own read captured (`captured`, its batch's schema) is a
// value the item did not show, read as saved processing reads an absent value.
// A field the read never captured, or a row whose captured fields are unknown,
// stays missing evidence. A derived column reads as not shown when the stored
// column it is computed from is.
import { cellOf, cellText } from "./cell-text.ts";
import type { AutomationStudioRecordDerivedField } from "./types.ts";

/** Whether `field` is captured by the row's own read and the row states no value for it, through any derived column's source. */
export function automationStudioRecordNotShown(
  values: Readonly<Record<string, unknown>>,
  captured: readonly string[] | undefined,
  field: string,
  derive: readonly AutomationStudioRecordDerivedField[] = []
): boolean {
  if (captured === undefined) return false;
  // A derived column always reads a stored field (`types.ts`).
  const source = derive.find((entry) => entry.id === field)?.from ?? field;
  return captured.includes(source) && cellText(cellOf(values, source)) === undefined;
}
