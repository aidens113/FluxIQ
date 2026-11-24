// The fields a read captured, from its batch's own schema (t993).
//
// A read's record output declares the columns it reads, and the row validator
// (`../validate-records.ts`) keeps every `include` field a row states and omits
// one it does not. So a field of the batch's own schema that a row lacks is a
// value the item did not show; a field outside it is one the read never looked
// for. `exclude` and `encrypt` fields are never kept on a row, so they are
// never captured.
import type { AutomationStudioRecordSchema } from "../schema.ts";

/** The field ids a batch with this schema captured on each of its rows, in schema order. */
export function automationStudioRecordCapturedFields(schema: AutomationStudioRecordSchema): string[] {
  return schema.fields.filter((field) => field.handling === undefined || field.handling === "include").map((field) => field.id);
}
