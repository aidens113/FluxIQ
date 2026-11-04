// The record schema of a read's rows, derived as a Flow's own record output
// would declare it: one field per column the rows carry, the value type the
// values show. What a read mints afresh each time (`$` keys, handles,
// evidence) is not a column, as a stored run dataset holds none
// (`engine/automation/lifecycle-run/act-identity.ts` leaves the same out).
import { AUTOMATION_STUDIO_RECORD_SCHEMA_LIMITS, type AutomationStudioRecordField, type AutomationStudioRecordSchema, type AutomationStudioRecordValueType } from "@fluxiq/contracts/automation";
import type { JsonObject } from "../../../../../core/index.ts";
import { automationStudioAnswerFirstReadColumns } from "./carried-columns.ts";

/** The schema of `rows`, or `undefined` when they carry no column to store. */
export function automationStudioAnswerFirstReadSchema(rows: readonly JsonObject[]): AutomationStudioRecordSchema | undefined {
  const columns = automationStudioAnswerFirstReadColumns(rows).slice(0, AUTOMATION_STUDIO_RECORD_SCHEMA_LIMITS.maxFields);
  if (!columns.length) return undefined;
  const fields: AutomationStudioRecordField[] = columns.map((id) => ({ id, label: id, valueType: valueTypeOf(rows.map((row) => row[id])) }));
  return { schemaVersion: "0.1", fields };
}

/** One type for every value present: string, number or boolean when they all are, else `json`. */
function valueTypeOf(values: readonly unknown[]): AutomationStudioRecordValueType {
  const types = new Set<string>();
  for (const value of values) {
    if (value === undefined || value === null) continue;
    types.add(typeof value === "object" ? "json" : typeof value);
  }
  if (types.size === 1) {
    const [only] = types;
    if (only === "string" || only === "number" || only === "boolean") return only;
  }
  return "json";
}
