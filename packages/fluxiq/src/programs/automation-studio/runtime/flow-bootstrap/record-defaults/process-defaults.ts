// The processing a part's answer implies for a record output that said none (K5).
//
// Only what is missing is derived, never what the model wrote: `columns` when
// the output declared none, from the answer's columns that the schema stores,
// in the answer's order; `dedupe` when the client reports a row identity,
// from the identity fields the schema stores. Nothing derivable returns
// `undefined` and the output is left exactly as it was. Every id returned is a
// stored field, so the contract's own reader (`parseAutomationStudioRecordProcessing`)
// takes it.
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AuthoringPartAnswer } from "./answer.ts";
import { authoringKey } from "../authoring/keys.ts";
import { isJsonObject } from "../authoring/values.ts";

/** The `process` to write on the output, or `undefined` to leave it as written. */
export function authoringPartProcessDefaults(input: {
  process: JsonValue | undefined;
  schema: JsonObject;
  part: AuthoringPartAnswer;
}): JsonObject | undefined {
  if (input.process !== undefined && !isJsonObject(input.process)) return undefined;
  const base: JsonObject = input.process ?? {};
  const stored = storedIds(input.schema);
  const added: JsonObject = {};
  if (base.columns === undefined) {
    const columns = matched(input.part.columns, stored);
    if (columns.length && keepsWhereFields(base.where, columns, stored)) added.columns = columns;
  }
  if (base.dedupe === undefined && input.part.rowIdentity?.length) {
    const by = matched(input.part.rowIdentity, stored);
    if (by.length) added.dedupe = { by };
  }
  return Object.keys(added).length ? { ...base, ...added } : undefined;
}

function storedIds(schema: JsonObject): string[] {
  const fields = Array.isArray(schema.fields) ? schema.fields : [];
  return fields.flatMap((field) => isJsonObject(field) && typeof field.id === "string" && field.handling !== "exclude" ? [field.id] : []);
}

/** Each name's stored field id, exactly then with case and separators ignored, each field once. */
function matched(names: readonly string[], stored: readonly string[]): string[] {
  const found: string[] = [];
  for (const name of names) {
    const id = stored.find((candidate) => candidate === name) ?? stored.find((candidate) => authoringKey(candidate) !== "" && authoringKey(candidate) === authoringKey(name));
    if (id !== undefined && !found.includes(id)) found.push(id);
  }
  return found;
}

/** The contract refuses `columns` that drop a field a `where` tests; a `where` that is not a list names none, and a field the schema does not store is not its concern. */
function keepsWhereFields(where: JsonValue | undefined, columns: readonly string[], stored: readonly string[]): boolean {
  if (!Array.isArray(where)) return true;
  return where.every((condition) => !isJsonObject(condition) || typeof condition.field !== "string" || !stored.includes(condition.field) || columns.includes(condition.field));
}
