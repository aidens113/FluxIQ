import { isPlainRecord } from "../../is-plain-record.ts";
import type { AutomationStudioRecordSchema } from "../../schema.ts";
import { foldedText } from "../cell-text.ts";
import { parseAutomationStudioRecordProcessing } from "../parse-processing.ts";
import { AUTOMATION_STUDIO_RECORD_FIELD_COMPARISONS } from "../processing-vocabulary.ts";
import type { AutomationStudioRecordProcessingBinding } from "./result.ts";

/** Binds exact ids or unique normalized labels, then uses the existing strict processing parser. */
export function bindAutomationStudioRecordProcessing(value: unknown, schema: AutomationStudioRecordSchema): AutomationStudioRecordProcessingBinding {
  if (!isPlainRecord(value)) {
    const parsed = parseAutomationStudioRecordProcessing(value, schema);
    return parsed.ok ? { ...parsed, bindings: {} } : { ...parsed, unresolved: [] };
  }
  // Binding is the untrusted instruction/amendment boundary; persisted stamps are read by the parser.
  if (Object.hasOwn(value, "declaration")) return { ok: false, issues: ["record_output.process_declaration_framework_owned"], unresolved: [] };
  const bound = new Map<string, string>();
  const unresolved = new Map<string, { field: string; reason: "missing" | "ambiguous" | "excluded" }>();
  const derived = new Set(Array.isArray(value.derive) ? value.derive.flatMap((entry) =>
    isPlainRecord(entry) && typeof entry.id === "string" ? [entry.id] : []) : []);
  const resolve = (written: unknown, allowDerived: boolean): unknown => {
    if (typeof written !== "string") return written;
    const exact = schema.fields.find((field) => field.id === written);
    if (!exact && allowDerived && derived.has(written)) return written;
    const matches = exact ? [exact] : schema.fields.filter((field) => foldedText(field.label) === foldedText(written));
    const field = matches.length === 1 ? matches[0] : undefined;
    const reason = matches.length === 0 ? "missing" : matches.length > 1 ? "ambiguous" : field?.handling === "exclude" ? "excluded" : undefined;
    if (reason) {
      unresolved.set(JSON.stringify([written, reason]), { field: written, reason });
      return written;
    }
    bound.set(written, field!.id);
    return field!.id;
  };
  const entry = (raw: unknown, references: readonly string[], allowDerived: boolean): unknown => {
    if (!isPlainRecord(raw)) return raw;
    const rewritten = { ...raw };
    for (const key of references) if (Object.hasOwn(rewritten, key)) rewritten[key] = resolve(rewritten[key], allowDerived);
    return rewritten;
  };
  const list = (raw: unknown, references: readonly string[], allowDerived: boolean): unknown =>
    Array.isArray(raw) ? raw.map((item) => entry(item, references, allowDerived)) : raw;
  const rewritten = { ...value };
  if (Object.hasOwn(value, "derive")) rewritten.derive = list(value.derive, ["from"], false);
  if (Object.hasOwn(value, "where")) rewritten.where = list(value.where, ["field"], true);
  if (Object.hasOwn(value, "anyOf")) rewritten.anyOf = Array.isArray(value.anyOf)
    ? value.anyOf.map((group) => list(group, ["field"], true)) : value.anyOf;
  if (Object.hasOwn(value, "compare")) rewritten.compare = list(value.compare, ["field", ...AUTOMATION_STUDIO_RECORD_FIELD_COMPARISONS], true);
  if (Object.hasOwn(value, "sort")) rewritten.sort = list(value.sort, ["field"], true);
  if (isPlainRecord(value.dedupe) && Array.isArray(value.dedupe.by)) {
    rewritten.dedupe = { ...value.dedupe, by: value.dedupe.by.map((field) => resolve(field, true)) };
  }
  if (Array.isArray(value.columns)) rewritten.columns = value.columns.map((field) => resolve(field, true));
  const parsed = parseAutomationStudioRecordProcessing(rewritten, schema);
  if (!parsed.ok || unresolved.size) {
    return {
      ok: false,
      issues: [...new Set([...unresolved.values()].map((field) => `record_output.process_binding_${field.reason}_field`).concat(parsed.ok ? [] : parsed.issues))],
      unresolved: [...unresolved.values()]
    };
  }
  return { ok: true, processing: parsed.processing, bindings: Object.fromEntries(bound) };
}
