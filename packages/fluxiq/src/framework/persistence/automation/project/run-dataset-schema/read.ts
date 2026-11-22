import { parseAutomationStudioRecordSchema, storedAutomationStudioRecordSchema, type AutomationStudioRecordSchema } from "@fluxiq/contracts/automation";

/** Strict stored schema without excluded fields; no row value or display inference. */
export function readAutomationStudioRunDatasetSchema(value: unknown): AutomationStudioRecordSchema {
  const parsed = parseAutomationStudioRecordSchema(value);
  if (!parsed.ok) throw new Error("Invalid run dataset schema.");
  return storedAutomationStudioRecordSchema(parsed.schema);
}
