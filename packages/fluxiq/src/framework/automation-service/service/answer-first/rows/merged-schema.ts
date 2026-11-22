import { mergeAutomationStudioRecordSchemas, type AutomationStudioRecordSchema } from "@fluxiq/contracts/automation";

/** A later page preserves the complete earlier schema or reports its conflicting declaration. */
export function automationStudioAnswerFirstMergedSchema(previous: AutomationStudioRecordSchema | undefined, incoming: AutomationStudioRecordSchema): AutomationStudioRecordSchema {
  if (previous === undefined) return incoming;
  const merged = mergeAutomationStudioRecordSchemas(previous, incoming);
  if (!merged.ok) throw new Error(`answer_first.rows_invalid_schema: ${merged.issues.join(", ")}`);
  return merged.schema;
}
