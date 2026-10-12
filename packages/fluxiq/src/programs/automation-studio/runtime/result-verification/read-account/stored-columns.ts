// The columns whose values reach a read's stored rows, so a condition over a
// column read only to filter by can say what it read (`condition.ts`).
//
// Three things can leave a column out of the stored rows, and each is known
// from what the run record and the Flow already hold: the page's own field map
// (`extraction.fieldNames`, which the domain narrows to the declared columns
// before dispatch), the record output's declared schema (record capture copies
// each row by it), and the record output's `process.columns` (the answer's
// columns). A column is stored only when every one of them that is stated keeps
// it. None stated: `undefined`, which the caller reads as "every column is
// stored" -- the older account, never a guess that a column was left out.

import type { JsonObject } from "../../../../../core/index.ts";

/**
 * The stored columns of a read: the keys every stated layer keeps, or
 * `undefined` when no layer is stated.
 */
export function automationStudioResultReadStoredColumns(extraction: JsonObject, parameters: JsonObject | undefined): ReadonlySet<string> | undefined {
  const output = recordOutputOf(parameters);
  const schema = output && isRecord(output.schema) && Array.isArray(output.schema.fields)
    ? keys(output.schema.fields.map((field) => (isRecord(field) ? field.id : undefined)))
    : undefined;
  const processed = output && isRecord(output.process) ? keys(output.process.columns) : undefined;
  const layers = [keys(extraction.fieldNames), schema, processed].filter((layer): layer is string[] => layer !== undefined);
  if (!layers.length) return undefined;
  const [first, ...rest] = layers;
  return new Set(first!.filter((key) => rest.every((layer) => layer.includes(key))));
}

/** The step's record output: the parameter object that names a dataset, as `build-test/stores.ts` finds it. */
function recordOutputOf(parameters: JsonObject | undefined): JsonObject | undefined {
  return Object.values(parameters ?? {}).find((value): value is JsonObject => isRecord(value) && typeof value.datasetId === "string" && value.datasetId.trim() !== "");
}

/** A non-empty list of string keys, or `undefined` for anything else, which states nothing. */
function keys(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.length > 0 && value.every((key) => typeof key === "string") ? (value as string[]) : undefined;
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
