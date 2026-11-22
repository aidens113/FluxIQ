import { isPlainRecord } from "../../is-plain-record.ts";
import type { AutomationStudioRecordSchema } from "../../schema.ts";
import type { AutomationStudioRecordProcessingDeclaration } from "./type.ts";

const KEYS: ReadonlySet<string> = new Set(["version", "source", "revision", "bindings"]);
const SOURCE = /^[a-f0-9]{64}$/u;

/** Strictly reads persisted provenance; shape validation does not establish who authored it. */
export function parseAutomationStudioRecordProcessingDeclaration(value: unknown, schema: AutomationStudioRecordSchema): AutomationStudioRecordProcessingDeclaration | null {
  if (!isPlainRecord(value) || Object.keys(value).length !== KEYS.size || !Object.keys(value).every((key) => KEYS.has(key))) return null;
  if (value.version !== 1 || typeof value.source !== "string" || !SOURCE.test(value.source)) return null;
  if (typeof value.revision !== "number" || !Number.isSafeInteger(value.revision) || value.revision <= 0) return null;
  if (!isPlainRecord(value.bindings)) return null;
  const stored = new Set(schema.fields.filter((field) => field.handling !== "exclude").map((field) => field.id));
  const bindings: [string, string][] = [];
  for (const [written, field] of Object.entries(value.bindings)) {
    if (!written.trim() || typeof field !== "string" || !stored.has(field)) return null;
    bindings.push([written, field]);
  }
  bindings.sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
  return { version: 1, source: value.source, revision: value.revision, bindings: Object.fromEntries(bindings) };
}
