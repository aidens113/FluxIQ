// The order a record set's kept rows run in by a date column they hold, read
// by Core's own date reader (framework plan P5, t795).
//
// **Why.** Live run `run-mvtdn37t-e1e4d0a7`: judges said a read's kept rows
// were "not newest first" while the dates the rows themselves held ran newest
// first. A `sortRead` (`./sort-reading.ts`) exists only where the answer has a
// sort; this reads any column of the stored rows that states a date ("1d",
// "4d", "Sep 24", "2026-09-24"), as the sort reads one
// (`automationStudioRecordAutoSortKind`), so a set with no sort can still be
// checked against its own values.
//
// **Conclusive or nothing.** A column counts only where every kept row states
// a date, the rows shown are every row stored, and the rows run one way (a
// tie is allowed, an all-equal column states no order). `nothingCut` says the
// store left out no row past the answer's limit: only then do the kept rows say
// anything about the rows around them.

import { automationStudioRecordAutoSortKind, readAutomationStudioRecordSortValue } from "@fluxiq/contracts/automation-studio";
import type { AutomationStudioResultRecordSetSummary } from "../record-set-summary.ts";

/** What a screened cell reads as in a summary row. */
const WITHHELD_VALUE = "[withheld]";

/** One date column of a set's kept rows and the way they run in it. */
export type AutomationStudioResultKeptDateOrder = {
  field: string;
  /** `desc`: newest first. `asc`: oldest first. */
  order: "desc" | "asc";
  /** True when no row was cut past a limit or left out as a repeat, so the kept rows are every row of the answer's running. */
  nothingCut: boolean;
};

/** Each date column the kept rows run one way in, in column order. `now` anchors relative dates. */
export function automationStudioResultKeptDateOrders(set: AutomationStudioResultRecordSetSummary, now: number): AutomationStudioResultKeptDateOrder[] {
  const rows = set.sampleRows ?? [];
  if (rows.length < 2 || set.truncated || rows.length !== set.recordCount) return [];
  const nothingCut = (set.processing?.cut ?? 0) === 0;
  return set.columns.flatMap((field) => {
    const cells = rows.map((row) => (Object.hasOwn(row, field) ? row[field] : undefined));
    if (cells.some((cell) => cell === undefined || cell === null || cell === WITHHELD_VALUE)) return [];
    if (automationStudioRecordAutoSortKind(cells, now) !== "date") return [];
    const instants = cells.map((cell) => readAutomationStudioRecordSortValue(cell, "date", now));
    if (instants.some((value) => typeof value !== "number")) return [];
    const order = runs(instants as number[]);
    return order === undefined ? [] : [{ field, order, nothingCut }];
  });
}

/** The way the instants run, or `undefined` for instants that run both ways or not at all. */
function runs(instants: readonly number[]): "desc" | "asc" | undefined {
  let down = false;
  let up = false;
  for (let index = 1; index < instants.length; index += 1) {
    if (instants[index]! < instants[index - 1]!) down = true;
    if (instants[index]! > instants[index - 1]!) up = true;
  }
  if (down === up) return undefined;
  return down ? "desc" : "asc";
}
