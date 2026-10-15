// Whether a condition tests a row's own label (t651): its tested value is the
// name the row is listed by, so a row failing it says only that its name does
// not say the condition's text.
//
// **Why.** A8 frozen pair 4, candidate towels `run-mva446jf-926a3c72`: a read
// kept rows by `retailer startsWith "<house name>"`, where the column it called
// `retailer` was read from the product's title, as a stand-in for "sold by the
// store itself". The house name is a word of the request, so t629's test
// (`./request-text-test.ts`) counted the condition as the request's own words,
// and every row it left out as failing them. Core then refuted four correct
// judges and, through t641, held the condition, though 7 of its 8 left-out
// rows were rows the request asks for. Core had measured only that a name does
// not start with a word -- never that the column holds what the request's word
// is about (who sells the row). So such a condition is never read as the
// request's own words (`./record.ts`, `requestQuotes`): it neither refutes a no
// nor accounts for a row it left out (`./record-conditions.ts`, t631, t641).
//
// **What counts, each from Core's own record and nothing a model wrote.**
//
// - The account marks it as testing the label column (`testedLabel`,
//   `../read-account/accounts.ts`).
// - A row it alone left out has a witness value, read by Core, that is that
//   row's own label.
// - The value it read on a row it kept (`(read "…" on a row it kept)`,
//   `../read-account/condition.ts`) is a stored row's label.
// - Its column is a stored column, and on a stored row it holds that row's
//   label.
//
// Values are compared folded (case, runs of space, a closing stop), and only
// whole: a column whose value merely starts a label (a brand beside a title)
// is a column of its own, and stays one the request's words can settle.

import type { AutomationStudioResultReadCondition } from "../contracts/index.ts";
import { automationStudioRequestRowLabel } from "../request-rows/index.ts";
import type { AutomationStudioResultNoStoredRow } from "./types.ts";

/** What the condition's wording says its read found on a kept row (`../read-account/condition.ts`). */
const FOUND_ON_KEPT = /\(read ("(?:[^"\\]|\\.)*") on a row it kept\)/u;
/** A column key, then a text relation: the subject of a text test as its account words it. */
const COLUMN_TESTED = /^([A-Za-z_][\w-]*) (?:not )?(?:contains|equals|startsWith|endsWith|matches)\b/u;
/** What a label that may not be said reads as (`../read-account/alone-rows.ts`). */
const WITHHELD_LABEL = "(withheld)";

/** Whether the condition tests a row's own label (header); `stored` the rows the result holds. */
export function automationStudioResultConditionTestsLabel(condition: AutomationStudioResultReadCondition, stored: readonly AutomationStudioResultNoStoredRow[]): boolean {
  if (condition.testedLabel === true) return true;
  const rows = condition.leftOutOnlyByThis ?? [];
  const observations = condition.leftOutObservations ?? [];
  for (const [at, row] of rows.entries()) {
    const witness = observations[at];
    const label = automationStudioRequestRowLabel(row);
    if (witness?.state === "present" && label !== WITHHELD_LABEL && same(witness.value, label)) return true;
  }
  const wording = condition.condition ?? "";
  const kept = keptValue(wording);
  if (kept !== undefined && stored.some((row) => same(kept, row.label))) return true;
  const column = COLUMN_TESTED.exec(wording.replace(FOUND_ON_KEPT, "").replace(/\s+/gu, " ").trim())?.[1];
  return column !== undefined && stored.some((row) => row.cells[column] !== undefined && same(row.cells[column]!, row.label));
}

/** The value the wording says the read found on a kept row, its quote and escaped quotes undone; none where it says none. */
function keptValue(wording: string): string | undefined {
  const said = FOUND_ON_KEPT.exec(wording)?.[1];
  return said === undefined ? undefined : said.slice(1, -1).replace(/\\(["\\])/gu, "$1");
}

/** Whether two texts are one value, compared folded (header). */
function same(left: string, right: string): boolean {
  const folded = fold(left);
  return folded.length > 0 && folded === fold(right);
}

/** A text as values are compared: lower case, each run of spaces one, no closing stop or comma (as `./record.ts` folds). */
function fold(text: string): string {
  return text.toLowerCase().replace(/\s+/gu, " ").replace(/[\s.,;:]+$/u, "").trim();
}
