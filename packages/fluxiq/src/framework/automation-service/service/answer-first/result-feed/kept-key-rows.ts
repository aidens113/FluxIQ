// Each kept row as the judge checks it (t1072): the asked columns and, beside them, the values the result's processing
// read on that row to keep it and to place it.
//
// **Why.** Run `run-mwyfoz8o-507c92f6` (0101): a saved Flow's replay kept the right seven rows in the right order, and the
// judge said no "only because the sort cannot be confirmed from the stored columns": the declaration sorted by a field
// the asked columns leave out, and the judge was shown the kept rows in the asked columns alone. A repair of six
// decisions and a judge call in the next attempt followed. Extraction keeps every column (AGENTS.md, 2026-11-20) and the
// asked columns are a view over the rows, so the values processing used are there to show.
//
// **Which values.** Every field the declaration's filters (`where`, `anyOf`, `compare`), dedupe and sort read, in that
// order, after the asked columns; a derived column as processing computed it, after the field it is derived from (and
// that field's own source, where it is derived too). A row with no value in one says `null`. Nothing is cut: every kept
// row, in the answer's order. Where every such field is already an asked column there is nothing to add, and nothing is
// returned.
import { automationStudioRecordAnyOfFields, automationStudioRecordDerivedValues, automationStudioRecordFieldComparisonFields, type AutomationStudioRecordProcessing } from "@fluxiq/contracts/automation";
import { isJsonValue } from "@fluxiq/contracts/fluxnode";
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";

/** Each kept row with its asked columns and the values the processing read on it; `undefined` where those add nothing. */
export function automationStudioAnswerFirstKeptKeyRows(rows: readonly Readonly<Record<string, unknown>>[], process: AutomationStudioRecordProcessing, asked: readonly string[], now: number): JsonObject[] | undefined {
  const derive = process.derive ?? [];
  const fromOf = new Map(derive.map((field) => [field.id, field.from]));
  const keys: string[] = [];
  const add = (field: string, seen: ReadonlySet<string> = new Set()): void => {
    // A derived column's source first, so the value it was computed from reads beside it.
    const from = fromOf.get(field);
    if (from !== undefined && !seen.has(field)) add(from, new Set([...seen, field]));
    if (!keys.includes(field)) keys.push(field);
  };
  for (const condition of process.where ?? []) add(condition.field);
  for (const group of process.anyOf ?? []) for (const field of automationStudioRecordAnyOfFields(group)) add(field);
  for (const comparison of process.compare ?? []) for (const field of automationStudioRecordFieldComparisonFields(comparison)) add(field);
  if (process.dedupe) for (const field of process.dedupe.by) add(field);
  for (const key of process.sort ?? []) add(key.field);
  const beside = keys.filter((field) => !asked.includes(field));
  if (!beside.length) return undefined;
  const shown = [...asked, ...beside];
  return rows.map((row) => {
    const values = derive.length ? automationStudioRecordDerivedValues(row, derive, now) : row;
    return Object.fromEntries(shown.map((field) => [field, jsonCell(values[field])]));
  });
}

/**
 * A cell as JSON carries it: a value the row does not hold is `null`, as the judged summary sends a value JSON has no
 * form for (`runtime/result-verification/flow-less/judged-summary.ts`, `jsonForm`). A kept row's cells are validated
 * records, so every other cell is JSON already.
 */
function jsonCell(value: unknown): JsonValue {
  if (value === undefined || !isJsonValue(value)) return null;
  return typeof value === "object" && value !== null ? structuredClone(value) : value;
}
