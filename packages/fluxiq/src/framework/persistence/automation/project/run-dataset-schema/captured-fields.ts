import { automationStudioRecordCapturedFields, type AutomationStudioRecordSchema } from "@fluxiq/contracts/automation";

/**
 * A batch's stored `captured_fields_json` (migration 0041, t998): the field ids its own read captured, from that batch's
 * own stored schema at write time, never the dataset's reconciled one. The end-of-run answer reads a captured field an
 * item does not show as "not shown" (`../run-dataset-answer/captured-fields.ts`).
 */
export function automationStudioRunDatasetCapturedFieldsJson(schema: AutomationStudioRecordSchema): string {
  return JSON.stringify(automationStudioRecordCapturedFields(schema));
}
