// The answer as the request names its columns (t1074): each stored field the request's column was placed on
// (`./column-names.ts`) is shown under the request's name, in the schema, the rows and the columns alike, so the answer
// is the table asked for without reading the list again. Extraction keeps every column and the asked columns are a view
// over the rows (AGENTS.md, 2026-11-20): only the answer's names change, never the stored rows the processing read.
//
// A name that is not a valid field id is written with `_` for its spaces and other marks (the asked-table check reads
// `due_date` as "due date"); a name that would take another field's id or label is left as it was.
import { AUTOMATION_STUDIO_RECORD_SCHEMA_LIMITS, type AutomationStudioRecordAskedColumns, type AutomationStudioRecordSchema } from "@fluxiq/contracts/automation";
import type { JsonObject } from "../../../../../core/index.ts";

export type AutomationStudioAnswerFirstAskedView = { schema: AutomationStudioRecordSchema; rows: JsonObject[]; columns: { id: string; label: string }[] };

/** Stored id to the answer's id, for each placed field whose id is not already the request's name. */
export function automationStudioAnswerFirstAskedRenames(asked: AutomationStudioRecordAskedColumns | undefined, schema: AutomationStudioRecordSchema): Map<string, { id: string; label: string }> {
  const renames = new Map<string, { id: string; label: string }>();
  if (!asked) return renames;
  const used = new Set<string>();
  for (const { asked: name, field } of asked.held) {
    if (name === field) continue;
    const id = name.replace(/[^A-Za-z0-9_-]+/gu, "_").replace(/^_+|_+$/gu, "");
    const others = schema.fields.filter((each) => each.id !== field);
    if (!AUTOMATION_STUDIO_RECORD_SCHEMA_LIMITS.fieldIdPattern.test(id) || used.has(id) || used.has(name)) continue;
    if (others.some((each) => [each.id, each.label].some((taken) => taken === id || taken === name))) continue;
    used.add(id);
    used.add(name);
    renames.set(field, { id, label: name });
  }
  return renames;
}

/** `rows` (and every row object given) with each renamed field's key changed, other keys in place. */
export function automationStudioAnswerFirstRenamedRow<T extends Readonly<Record<string, unknown>>>(row: T, renames: ReadonlyMap<string, { id: string }>): JsonObject {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [renames.get(key)?.id ?? key, value])) as JsonObject;
}

export function automationStudioAnswerFirstAskedView(view: AutomationStudioAnswerFirstAskedView, renames: ReadonlyMap<string, { id: string; label: string }>): AutomationStudioAnswerFirstAskedView {
  if (!renames.size) return view;
  return {
    schema: { ...view.schema, fields: view.schema.fields.map((field) => (renames.has(field.id) ? { ...field, ...renames.get(field.id)! } : field)), ...(view.schema.primaryKey ? { primaryKey: view.schema.primaryKey.map((id) => renames.get(id)?.id ?? id) } : {}) },
    rows: view.rows.map((row) => automationStudioAnswerFirstRenamedRow(row, renames)),
    columns: view.columns.map((column) => (renames.has(column.id) ? { ...renames.get(column.id)! } : column))
  };
}
