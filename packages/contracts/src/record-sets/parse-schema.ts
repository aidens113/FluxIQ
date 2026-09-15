import { isPlainRecord } from "./is-plain-record.ts";
import {
  AUTOMATION_STUDIO_RECORD_FIELD_HANDLINGS,
  AUTOMATION_STUDIO_RECORD_SCHEMA_LIMITS,
  AUTOMATION_STUDIO_RECORD_VALUE_TYPES,
  type AutomationStudioRecordField,
  type AutomationStudioRecordFieldHandling,
  type AutomationStudioRecordSchema,
  type AutomationStudioRecordValueType
} from "./schema.ts";

export type AutomationStudioRecordParseOptions = {
  /** Accept `handling: "encrypt"`. Nothing passes true before record keys exist (K11). */
  allowEncrypt?: boolean;
};

export type AutomationStudioRecordSchemaParseResult =
  | { ok: true; schema: AutomationStudioRecordSchema }
  | { ok: false; issues: string[] };

const SCHEMA_KEYS: ReadonlySet<string> = new Set(["schemaVersion", "fields", "primaryKey"]);
const FIELD_KEYS: ReadonlySet<string> = new Set(["id", "label", "valueType", "required", "handling"]);
const VALUE_TYPES: ReadonlySet<string> = new Set(AUTOMATION_STUDIO_RECORD_VALUE_TYPES);
const HANDLINGS: ReadonlySet<string> = new Set(AUTOMATION_STUDIO_RECORD_FIELD_HANDLINGS);
const RESERVED_FIELD_IDS: ReadonlySet<string> = new Set(AUTOMATION_STUDIO_RECORD_SCHEMA_LIMITS.reservedFieldIds);

/**
 * Parses an untrusted value into a record schema, returning fresh objects.
 *
 * Exact fields: an unknown key, a wrong type, or a broken bound rejects the
 * schema; nothing is repaired. Issues are stable codes prefixed
 * `record_schema.`, each listed once. `handling: "encrypt"` yields
 * `record_schema.encrypt_unavailable` unless `allowEncrypt` is true.
 */
export function parseAutomationStudioRecordSchema(value: unknown, options: AutomationStudioRecordParseOptions = {}): AutomationStudioRecordSchemaParseResult {
  const allowEncrypt = options.allowEncrypt ?? false;
  const issues = new Set<string>();
  let schema: AutomationStudioRecordSchema | null;
  try {
    schema = parseSchema(value, allowEncrypt, issues);
  } catch {
    issues.add("record_schema.invalid");
    schema = null;
  }
  if (schema === null || issues.size > 0) return { ok: false, issues: issues.size > 0 ? [...issues] : ["record_schema.invalid"] };
  return { ok: true, schema };
}

function parseSchema(value: unknown, allowEncrypt: boolean, issues: Set<string>): AutomationStudioRecordSchema | null {
  if (!isPlainRecord(value)) {
    issues.add("record_schema.not_object");
    return null;
  }
  if (!Object.keys(value).every((key) => SCHEMA_KEYS.has(key))) issues.add("record_schema.unknown_key");
  if (value.schemaVersion !== "0.1") issues.add("record_schema.invalid_schema_version");
  const fields = parseFields(value.fields, allowEncrypt, issues);
  const primaryKey = value.primaryKey === undefined ? undefined : parsePrimaryKey(value.primaryKey, fields, issues);
  if (fields === null || primaryKey === null || issues.size > 0) return null;
  const schema: AutomationStudioRecordSchema = { schemaVersion: "0.1", fields };
  if (primaryKey !== undefined) schema.primaryKey = primaryKey;
  return schema;
}

function parseFields(value: unknown, allowEncrypt: boolean, issues: Set<string>): AutomationStudioRecordField[] | null {
  if (!Array.isArray(value)) {
    issues.add("record_schema.invalid_fields");
    return null;
  }
  if (value.length === 0) {
    issues.add("record_schema.no_fields");
    return null;
  }
  if (value.length > AUTOMATION_STUDIO_RECORD_SCHEMA_LIMITS.maxFields) {
    issues.add("record_schema.too_many_fields");
    return null;
  }
  const ids = new Set<string>();
  const labels = new Set<string>();
  const fields: AutomationStudioRecordField[] = [];
  let valid = true;
  for (let index = 0; index < value.length; index += 1) {
    const field = parseField(value[index], allowEncrypt, issues);
    if (field === null) {
      valid = false;
      continue;
    }
    if (ids.has(field.id)) {
      issues.add("record_schema.duplicate_field_id");
      valid = false;
    }
    if (labels.has(field.label)) {
      issues.add("record_schema.duplicate_field_label");
      valid = false;
    }
    ids.add(field.id);
    labels.add(field.label);
    fields.push(field);
  }
  if (!valid) return null;
  if (fields.every((field) => field.handling === "exclude")) {
    issues.add("record_schema.no_stored_fields");
    return null;
  }
  return fields;
}

function parseField(value: unknown, allowEncrypt: boolean, issues: Set<string>): AutomationStudioRecordField | null {
  if (!isPlainRecord(value)) {
    issues.add("record_schema.invalid_field");
    return null;
  }
  const found: string[] = [];
  if (!Object.keys(value).every((key) => FIELD_KEYS.has(key))) found.push("record_schema.unknown_field_key");
  const { id, label, valueType, required, handling } = value;
  if (typeof id !== "string" || !AUTOMATION_STUDIO_RECORD_SCHEMA_LIMITS.fieldIdPattern.test(id)) found.push("record_schema.invalid_field_id");
  else if (RESERVED_FIELD_IDS.has(id)) found.push("record_schema.reserved_field_id");
  if (!isLabel(label)) found.push("record_schema.invalid_field_label");
  if (!isValueType(valueType)) found.push("record_schema.invalid_value_type");
  if (required !== undefined && typeof required !== "boolean") found.push("record_schema.invalid_required");
  if (handling !== undefined && !isHandling(handling)) found.push("record_schema.invalid_handling");
  if (handling === "encrypt" && !allowEncrypt) found.push("record_schema.encrypt_unavailable");
  for (const issue of found) issues.add(issue);
  if (found.length > 0 || typeof id !== "string" || !isLabel(label) || !isValueType(valueType)) return null;
  const field: AutomationStudioRecordField = { id, label, valueType };
  if (typeof required === "boolean") field.required = required;
  if (isHandling(handling)) field.handling = handling;
  return field;
}

function parsePrimaryKey(value: unknown, fields: readonly AutomationStudioRecordField[] | null, issues: Set<string>): string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > AUTOMATION_STUDIO_RECORD_SCHEMA_LIMITS.maxFields || !value.every((item) => typeof item === "string")) {
    issues.add("record_schema.invalid_primary_key");
    return null;
  }
  // Field references are only meaningful against a schema whose fields parsed.
  if (fields === null) return null;
  const byId = new Map(fields.map((field) => [field.id, field]));
  const seen = new Set<string>();
  let valid = true;
  for (const id of value as string[]) {
    const field = byId.get(id);
    let issue: string | null = null;
    if (seen.has(id)) issue = "record_schema.primary_key_duplicate_field";
    else if (field === undefined) issue = "record_schema.primary_key_unknown_field";
    else if (field.handling === "exclude") issue = "record_schema.primary_key_excluded_field";
    else if (field.handling === "encrypt") issue = "record_schema.primary_key_encrypted_field";
    if (issue !== null) {
      issues.add(issue);
      valid = false;
    }
    seen.add(id);
  }
  return valid ? [...(value as string[])] : null;
}

function isLabel(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= AUTOMATION_STUDIO_RECORD_SCHEMA_LIMITS.labelMaxLength;
}

function isValueType(value: unknown): value is AutomationStudioRecordValueType {
  return typeof value === "string" && VALUE_TYPES.has(value);
}

function isHandling(value: unknown): value is AutomationStudioRecordFieldHandling {
  return typeof value === "string" && HANDLINGS.has(value);
}
