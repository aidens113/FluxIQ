import { mergeAutomationStudioRecordSchemas, parseAutomationStudioRecordSchema, type AutomationStudioRecordSchema } from "@fluxiq/contracts/automation";

/** Reconcile the actual contributing captures, retaining P1 metadata. Never infer an automatic schema from projected rows. */
export function automationStudioAnswerFirstResultSchema(pages: readonly { source: string; schema: AutomationStudioRecordSchema | undefined }[]):
  { ok: true; schema: AutomationStudioRecordSchema } | { ok: false; issues: string[] } {
  let schema: AutomationStudioRecordSchema | undefined;
  const labels = new Map<string, string>();
  for (const page of pages) {
    const parsed = parseAutomationStudioRecordSchema(page.schema);
    if (!parsed.ok) return { ok: false, issues: [`Missing or invalid retained schema for source ${page.source}.`, ...parsed.issues] };
    for (const field of parsed.schema.fields) {
      const label = field.label.trim().replace(/\s+/gu, " ").toLowerCase();
      const previous = labels.get(label);
      if (previous !== undefined && previous !== field.id) return { ok: false, issues: [`Ambiguous captured column ${field.label}: ${previous}, ${field.id}. Bind the distinct source fields explicitly.`] };
      labels.set(label, field.id);
    }
    if (!schema) schema = parsed.schema;
    else {
      const merged = mergeAutomationStudioRecordSchemas(schema, parsed.schema);
      if (!merged.ok) return { ok: false, issues: [`Conflicting retained schema at source ${page.source}.`, ...merged.issues] };
      schema = merged.schema;
    }
  }
  return schema ? { ok: true, schema } : { ok: false, issues: ["No contributing captured source and retained schema are available."] };
}
