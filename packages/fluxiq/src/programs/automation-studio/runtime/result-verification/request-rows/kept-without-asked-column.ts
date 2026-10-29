// Rows the result keeps with no value in a column the answer asks for, where
// every other row it keeps carries one (t663).
//
// **Why.** A8 towels `run-mvahlxuu-760d9e28`: a build trial stored the nine
// rows asked for and one more, a holder for the item rather than the item, and
// both re-asked judges said yes. Every gate a yes passes is about rows a
// condition left out; none is about the rows a read kept. Core held the one
// signal that set the extra row apart and never said it: it was the only
// stored row without a value in one of the answer's four columns, which the
// other nine all carried.
//
// **The rule, and nothing read from a model.** Per record set whose every row
// was sent (no row cut, no column cut): the answer's columns are the record
// output's `process.columns` where the Flow states them for that dataset
// (`flowShape[].parameters`), else the set's stored columns. A column is
// measured on the set's rows, each read as carrying a value when it is present,
// not null and not an empty string (`../result-summary.ts`, `carriesValue`).
// The rows lacking it are flagged only when they are few and the rest are
// many:
//
// - at most `max(1, floor(rows / 10))` rows lack the column (`FEW_IN`), so an
//   optional column empty on several rows of an ordinary list is never a flag;
// - at least `CARRYING_AT_LEAST` (four) other rows carry it, so a short list,
//   or a column empty on every row (a broken read, which
//   `../read-account/emptied-columns.ts` and the repair's always-empty finding
//   speak of), is never a flag.
//
// A row is named by its label, its first column holding text, as
// `summary-reads.ts` names a stored row; a row with no text is not flagged, for
// nothing could name it. The record sets only a subflow trial's entry
// collected are left out, as `summary-reads.ts` leaves them out, and so are
// record sets of working rows (`../read-account/working-sets.ts`, t752): the rows a repeat
// walked before a later read of the same list stored the answer are not rows
// the result keeps.
//
// It flags; it does not judge. The row may be exactly what was asked, its value
// simply not shown on the page: `../verdict/` holds a yes to naming it, in a
// sentence quoting the request's words, and never refuses one for it.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioResultRecordSetSummary, AutomationStudioRunResultSummary } from "../contracts/index.ts";
import type { AutomationStudioRequestRowsKept } from "./types.ts";
// The leaf, not the barrel (`summary-reads.ts`).
import { automationStudioStoredListItems } from "../stored-list/index.ts";
import { automationStudioResultReadWorkingSets } from "../read-account/working-sets.ts";

/** How many rows in each ten may lack a column for them to be flagged, at least one (header). */
const FEW_IN = 10;
/** How many other rows must carry the column (header). */
const CARRYING_AT_LEAST = 4;

/** Each record set's kept rows that alone lack an answer column, one flag per column; none when there are none. */
export function automationStudioResultKeptWithoutAskedColumn(summary: AutomationStudioRunResultSummary): AutomationStudioRequestRowsKept[] {
  const entrySteps = new Set(summary.taskChecklist?.entry?.steps ?? []);
  const working = automationStudioResultReadWorkingSets(summary);
  return summary.recordSets.flatMap((set) => {
    if (working.has(set.datasetId)) return [];
    if (entrySteps.size && (set.processing?.passes.length ?? 0) > 0 && set.processing!.passes.every((pass) => entrySteps.has(pass.node))) return [];
    const rows = set.sampleRows ?? [];
    if (set.truncated || set.columnsWithheld || rows.length !== set.recordCount) return [];
    const labelled = rows.map((row) => ({ row, label: labelOf(row, set.columns) }));
    const pool = [...new Set(labelled.flatMap((entry) => entry.label === undefined ? [] : [entry.label]))];
    const few = Math.max(1, Math.floor(rows.length / FEW_IN));
    return answerColumns(summary, set).flatMap((column): AutomationStudioRequestRowsKept[] => {
      const lacking = labelled.filter((entry) => !carriesValue(entry.row, column));
      if (!lacking.length || lacking.length > few || rows.length - lacking.length < CARRYING_AT_LEAST) return [];
      const named = [...new Set(lacking.flatMap((entry) => entry.label === undefined ? [] : [entry.label]))];
      return named.length ? [{ kind: "column", datasetId: set.datasetId, missing: column, rows: named, of: rows.length, pool }] : [];
    });
  });
}

/** The answer's columns: the record output's `process.columns` for this dataset where the Flow states them, else the stored columns (header). */
function answerColumns(summary: AutomationStudioRunResultSummary, set: AutomationStudioResultRecordSetSummary): string[] {
  for (const step of summary.flowShape) {
    const output = Object.values(step.parameters ?? {}).find((value): value is JsonObject => isObject(value) && value.datasetId === set.datasetId);
    const columns = output && isObject(output.process) ? automationStudioStoredListItems(output.process.columns) : undefined;
    if (columns && columns.length && columns.every((column) => typeof column === "string")) {
      return (columns as string[]).filter((column) => set.columns.includes(column));
    }
  }
  return set.columns;
}

/** A stored row's label: its first column holding text (`summary-reads.ts`). */
function labelOf(row: JsonObject, columns: readonly string[]): string | undefined {
  const column = columns.find((id) => typeof row[id] === "string" && (row[id] as string).trim().length > 0);
  return column === undefined ? undefined : (row[column] as string);
}

/** Whether a stored row carries a value for a column: present, not null, and not an empty string (`../result-summary.ts`). */
function carriesValue(row: JsonObject, id: string): boolean {
  if (!Object.hasOwn(row, id)) return false;
  const value = row[id];
  if (value === null || value === undefined) return false;
  return typeof value !== "string" || value.trim().length > 0;
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
