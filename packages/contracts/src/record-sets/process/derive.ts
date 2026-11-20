// The columns a processing computes before it filters (t970).
//
// A row read off a page often states what a request decides by inside a longer
// value: a was-price beside a price, a count inside a sentence, a date inside a
// byline. A `where` reads the first number or date a value states, so a value
// stating two could not be filtered by its second. `derive` names a column
// computed from one stored column of the same row: its text, or the first
// group (else the whole match) of a pattern in it, read as text, the number it
// states or the date it states. The readers are the ones the conditions and the
// sort use (`read-number.ts`, `row-date.ts`), so a derived value reads alike
// everywhere it is tested. A date is written back as an ISO date, which those
// readers read as the same instant.
//
// A derived column is the processing's own: it is never stored and never in
// the answer (`process-rows.ts` answers each row's stored values), so the
// answer's columns stay the schema's whatever the processing computes.

import { cellOf, cellText, collapsedText } from "./cell-text.ts";
import { automationStudioRecordConditionPattern } from "./condition/index.ts";
import { readAutomationStudioRecordNumber } from "./read-number.ts";
import { readAutomationStudioRecordConditionDate } from "./row-date.ts";
import type { AutomationStudioRecordDerivedField } from "./types.ts";

/** The row's values with each derived column set where it has a value, a new object; `values` is not modified. */
export function automationStudioRecordDerivedValues(
  values: Readonly<Record<string, unknown>>,
  derive: readonly AutomationStudioRecordDerivedField[],
  now: number
): Record<string, unknown> {
  const derived: Record<string, unknown> = { ...values };
  for (const field of derive) {
    const value = automationStudioRecordDerivedValue(derived, field, now);
    if (value === undefined) delete derived[field.id];
    else derived[field.id] = value;
  }
  return derived;
}

/** One derived column's value for a row, or `undefined` where the row states none (header). */
export function automationStudioRecordDerivedValue(values: Readonly<Record<string, unknown>>, field: AutomationStudioRecordDerivedField, now: number): string | number | undefined {
  const text = cellText(cellOf(values, field.from));
  if (text === undefined) return undefined;
  const part = field.pattern === undefined ? collapsedText(text) : matched(text, field.pattern);
  if (part === undefined || part === "") return undefined;
  if (field.as === "number") return readAutomationStudioRecordNumber(part);
  if (field.as === "date") {
    const at = readAutomationStudioRecordConditionDate(part, now);
    return at === undefined ? undefined : new Date(at).toISOString();
  }
  return part;
}

/** The pattern's first group in the text, else its whole match; `undefined` for none, or a pattern that cannot run. */
function matched(text: string, pattern: string): string | undefined {
  const compiled = automationStudioRecordConditionPattern(pattern);
  const match = compiled?.exec(collapsedText(text));
  if (!match) return undefined;
  const group = match.slice(1).find((value) => value !== undefined);
  return collapsedText(group ?? match[0]);
}
