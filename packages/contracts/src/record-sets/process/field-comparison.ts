// Whether two columns of one row compare as a `compare` asks (t970).
//
// A bound is a value written into the declaration; some requests compare a row
// with itself instead -- a price below its was-price, an end after a start. Each
// side is read as the conditions read it: the first number the value states
// (`read-number.ts`), or the date it states (`row-date.ts`). A side that states
// none fails the comparison whatever `not` says, as a date bound does
// (`condition/holds.ts`): a row whose comparison cannot be made is never kept
// as matching.

import { cellOf, cellText } from "./cell-text.ts";
import { AUTOMATION_STUDIO_RECORD_FIELD_COMPARISONS } from "./processing-vocabulary.ts";
import { readAutomationStudioRecordNumber } from "./read-number.ts";
import { readAutomationStudioRecordConditionDate } from "./row-date.ts";
import type { AutomationStudioRecordFieldComparison } from "./types.ts";

type Comparison = (typeof AUTOMATION_STUDIO_RECORD_FIELD_COMPARISONS)[number];

/** How far apart two numbers may be and still be equal, as `equals` reads a number. */
const EQUAL_WITHIN = 1e-9;

const HOLDS: Record<Comparison, (left: number, right: number) => boolean> = {
  atLeast: (left, right) => left >= right,
  atMost: (left, right) => left <= right,
  lessThan: (left, right) => left < right,
  greaterThan: (left, right) => left > right,
  equals: (left, right) => Math.abs(left - right) <= EQUAL_WITHIN
};

/** Whether the comparison holds of the row's values (header). */
export function automationStudioRecordFieldComparisonHolds(comparison: AutomationStudioRecordFieldComparison, values: Readonly<Record<string, unknown>>, now: number): boolean {
  const read = (field: string): number | undefined => sideOf(cellOf(values, field), comparison.as ?? "number", now);
  const left = read(comparison.field);
  if (left === undefined) return false;
  let held = true;
  for (const key of AUTOMATION_STUDIO_RECORD_FIELD_COMPARISONS) {
    const other = comparison[key];
    if (other === undefined) continue;
    const right = read(other);
    if (right === undefined) return false;
    if (!HOLDS[key](left, right)) held = false;
  }
  return comparison.not === true ? !held : held;
}

/** The columns a comparison reads, each once, its own first. */
export function automationStudioRecordFieldComparisonFields(comparison: AutomationStudioRecordFieldComparison): string[] {
  const named = AUTOMATION_STUDIO_RECORD_FIELD_COMPARISONS.flatMap((key) => (comparison[key] === undefined ? [] : [comparison[key]!]));
  return [...new Set([comparison.field, ...named])];
}

/** The comparison in words: `price lessThan was_price`, `ends not (atLeast starts and atMost due) as a date`. */
export function automationStudioRecordFieldComparisonText(comparison: AutomationStudioRecordFieldComparison): string {
  const said = AUTOMATION_STUDIO_RECORD_FIELD_COMPARISONS.flatMap((key) => (comparison[key] === undefined ? [] : [`${key} ${comparison[key]!}`]));
  const joined = said.join(" and ");
  const dated = comparison.as === "date" ? " as a date" : "";
  if (comparison.not !== true) return `${comparison.field} ${joined}${dated}`;
  return `${comparison.field} not ${said.length > 1 ? `(${joined})` : joined}${dated}`;
}

function sideOf(cell: unknown, kind: "number" | "date", now: number): number | undefined {
  if (kind === "number" && typeof cell === "number") return Number.isFinite(cell) ? cell : undefined;
  const text = cellText(cell);
  if (text === undefined) return undefined;
  return kind === "date" ? readAutomationStudioRecordConditionDate(text, now) : readAutomationStudioRecordNumber(text);
}
