import { AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS, type AutomationStudioRecordSchema } from "@fluxiq/contracts/automation";

/** Rows serialized under their declared stored field allowlist; validation never revives an excluded key. */
export function serializedAutomationStudioRunDatasetRows(rows: unknown, schema: AutomationStudioRecordSchema): string[] {
  if (!Array.isArray(rows)) throw new Error("Run dataset rows must be an array.");
  const fieldIds = new Set(schema.fields.map((field) => field.id));
  return rows.map((row: unknown) => {
    if (typeof row !== "object" || row === null || Array.isArray(row)
      || (Object.getPrototypeOf(row) !== Object.prototype && Object.getPrototypeOf(row) !== null)) throw new Error("Run dataset row must be an object.");
    for (const key of Object.keys(row)) {
      if (!fieldIds.has(key)) throw new Error("Run dataset row holds a key that is not in the stored schema.");
    }
    const rowJson = JSON.stringify(row);
    if (Buffer.byteLength(rowJson, "utf8") > AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS.rowMaxBytes) throw new Error("Run dataset row exceeds the row size limit.");
    return rowJson;
  });
}
