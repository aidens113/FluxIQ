// The rows two or more `where` conditions of a read left out together, as the
// judge is shown them (t655).
//
// **Why.** A condition's `leftOutOnlyByThis` names only the rows it alone left
// out (`alone-rows.ts`): a row two conditions both rejected is named under
// neither. So a read's labels never covered every row it saw, and t654's test of
// whether they do (`../refuted-no/record.ts`) failed on every judged trial of A8
// frozen pair 5 (`run-mva6mlm4-97fe42f9`: seen 23, kept 9, 12 left out alone).
// Each such row is named here once, under the set of conditions it failed.
//
// **What arrives.** A list of `{ failed, rows }`: `failed` the conditions'
// 0-based places in the authored `where`, two or more, each below the read's
// condition count, and `rows` the rows that failed exactly those, each a row
// record led by its label, the shape a condition's alone rows arrive in. Only
// the label is said: no one condition's tested value is the reason such a row
// is out. Anything else is left out whole.
//
// **Screened as a condition's alone rows are** (`alone-rows.ts`): a label from
// a denied column, or shaped like a credential, is said as withheld and still
// counts as a row.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioResultLeftOutTogether } from "../contracts/index.ts";
import { automationStudioResultReadAloneRows } from "./alone-rows.ts";
import { automationStudioResultReadLeftOutCells, automationStudioResultReadLeftOutMarks } from "../left-out-cells/index.ts";

/**
 * Each set of conditions that left rows out together, numbered from 1 in
 * ascending order, with its rows' labels screened (header); `undefined` for
 * none, or for anything that is not that list.
 */
export function automationStudioResultReadTogetherRows(value: JsonValue | undefined, conditionCount: number, deniedKeys: readonly string[]): AutomationStudioResultLeftOutTogether[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const sets: AutomationStudioResultLeftOutTogether[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || !Array.isArray(entry.failed) || !Array.isArray(entry.rows)) return undefined;
    const failed = entry.failed;
    if (failed.length < 2 || !failed.every((place) => typeof place === "number" && Number.isSafeInteger(place) && place >= 0 && place < conditionCount)) return undefined;
    const numbers = [...new Set(failed as number[])].sort((a, b) => a - b).map((place) => place + 1);
    if (numbers.length !== failed.length) return undefined;
    const rows = automationStudioResultReadAloneRows(entry.rows.map(labelOnly), deniedKeys);
    if (!rows || rows.length !== entry.rows.length) return undefined;
    // Each row's own cells beside its label (`../left-out-cells/`, t771).
    const cells = automationStudioResultReadLeftOutCells(entry.rows, rows.length, deniedKeys);
    // And the marks the client read on those items, beside the cells (`../left-out-cells/`, t810).
    const marks = automationStudioResultReadLeftOutMarks(entry.marks, rows.length, deniedKeys);
    sets.push({ conditions: numbers, rows, ...(cells ? { cells } : {}), ...(marks ? { marks } : {}) });
  }
  return sets.length ? sets : undefined;
}

/** A row cut to its first cell, its label (header). Anything else as it was, for the screen to refuse. */
function labelOnly(row: JsonValue): JsonValue {
  if (!isRecord(row)) return row;
  const [label] = Object.entries(row);
  return label === undefined ? row : ({ [label[0]]: label[1] } as JsonObject);
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
