import { parseAutomationStudioRecordSchema, type AutomationStudioRecordParseOptions } from "./parse-schema.ts";
import type { AutomationStudioRecordField, AutomationStudioRecordSchema } from "./schema.ts";

/** Compatible page schemas form one retained dataset; conflicting declarations never guess a shared meaning. */
export function mergeAutomationStudioRecordSchemas(left: AutomationStudioRecordSchema, right: AutomationStudioRecordSchema, options: AutomationStudioRecordParseOptions = {}):
  { ok: true; schema: AutomationStudioRecordSchema } | { ok: false; issues: string[] } {
  const a = parseAutomationStudioRecordSchema(left, options);
  const b = parseAutomationStudioRecordSchema(right, options);
  if (!a.ok) return a;
  if (!b.ok) return b;
  if (JSON.stringify(a.schema.primaryKey ?? null) !== JSON.stringify(b.schema.primaryKey ?? null)) return { ok: false, issues: ["record_schema.union_primary_key_conflict"] };
  const incoming = new Map(b.schema.fields.map((field) => [field.id, field]));
  const fields: AutomationStudioRecordField[] = [];
  for (const field of a.schema.fields) {
    const next = incoming.get(field.id);
    if (!next) {
      fields.push({ ...field, required: false });
      continue;
    }
    const conflict = field.valueType !== next.valueType ? "value_type"
      : (field.handling ?? "include") !== (next.handling ?? "include") ? "handling"
      : field.semanticType !== undefined && next.semanticType !== undefined && field.semanticType !== next.semanticType ? "semantic_type"
      : field.mark !== undefined && next.mark !== undefined && field.mark !== next.mark ? "mark" : undefined;
    if (conflict) return { ok: false, issues: [`record_schema.union_${conflict}_conflict`] };
    fields.push({
      ...field,
      ...(field.semanticType === undefined && next.semanticType !== undefined ? { semanticType: next.semanticType } : {}),
      ...(field.mark === undefined && next.mark !== undefined ? { mark: next.mark } : {}),
      ...((field.required === true || next.required === true) ? { required: field.required === true && next.required === true } : {})
    });
    incoming.delete(field.id);
  }
  const labels = new Set(fields.map((field) => field.label));
  for (const field of incoming.values()) {
    let label = field.label;
    for (let suffix = 2; labels.has(label); suffix += 1) label = `${field.label.slice(0, 90)} (${field.id.slice(0, 90)} ${suffix})`;
    labels.add(label);
    fields.push({ ...field, label, required: false });
  }
  return parseAutomationStudioRecordSchema({ schemaVersion: "0.1", fields, ...(a.schema.primaryKey === undefined ? {} : { primaryKey: [...a.schema.primaryKey] }) }, options);
}
