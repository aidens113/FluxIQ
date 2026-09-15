import type { AutomationStudioRecordField, AutomationStudioRecordSchema } from "./schema.ts";

/**
 * The schema as it is stored and hashed: every `exclude` field removed, so an
 * excluded field id never reaches disk. Returns fresh objects and leaves the
 * input unmodified.
 */
export function storedAutomationStudioRecordSchema(schema: AutomationStudioRecordSchema): AutomationStudioRecordSchema {
  const fields: AutomationStudioRecordField[] = [];
  for (const source of schema.fields) {
    if (source.handling === "exclude") continue;
    const field: AutomationStudioRecordField = { id: source.id, label: source.label, valueType: source.valueType };
    if (source.required !== undefined) field.required = source.required;
    if (source.handling !== undefined) field.handling = source.handling;
    fields.push(field);
  }
  const stored: AutomationStudioRecordSchema = { schemaVersion: schema.schemaVersion, fields };
  if (schema.primaryKey !== undefined) stored.primaryKey = [...schema.primaryKey];
  return stored;
}
