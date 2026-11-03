import type { AutomationStudioRecordSchema } from "@fluxiq/contracts/automation";

/** The stored schema narrowed to `columns`, in their order; a primary key survives only when every id it names does. */
export function automationStudioRecordSchemaOfColumns(schema: AutomationStudioRecordSchema, columns: readonly string[]): AutomationStudioRecordSchema {
  const fields = columns.flatMap((column) => schema.fields.filter((field) => field.id === column));
  const narrowed: AutomationStudioRecordSchema = { schemaVersion: schema.schemaVersion, fields };
  if (schema.primaryKey && schema.primaryKey.every((id) => columns.includes(id))) narrowed.primaryKey = schema.primaryKey;
  return narrowed;
}
