import {
  AUTOMATION_STUDIO_RECORD_FIELD_HANDLINGS,
  AUTOMATION_STUDIO_RECORD_SCHEMA_LIMITS,
  AUTOMATION_STUDIO_RECORD_VALUE_TYPES,
  AUTOMATION_STUDIO_RECORD_WRITE_MODES,
  type AutomationStudioRecordField,
  type AutomationStudioRecordFieldHandling,
  type AutomationStudioRecordOutput,
  type AutomationStudioRecordSchema,
  type AutomationStudioRecordValueType,
  type AutomationStudioRecordWriteMode
} from "fluxiq/automation-studio/nodes";

// Pure edits over the record output the record-output editor writes into a
// node's parameters. Every edit returns fresh objects built field by field, so
// the saved value never carries a key K1's parser refuses. A draft may still be
// incomplete (an empty table id, no fields); `recordOutputParameterError` says
// what is missing.

export type RecordOutputSettingsChange = {
  datasetId?: string;
  label?: string;
  recordsPath?: string;
  writeMode?: AutomationStudioRecordWriteMode;
  /** `null` removes the setting, so the default of 1,000 applies. */
  maxRecords?: number | null;
};

export type RecordFieldChange = {
  label?: string;
  id?: string;
  valueType?: AutomationStudioRecordValueType;
  required?: boolean;
};

type OutputSettings = {
  datasetId: string;
  label: string;
  recordsPath: string;
  writeMode: AutomationStudioRecordWriteMode;
  maxRecords: number | null;
};

type FieldParts = {
  id: string;
  label: string;
  valueType: AutomationStudioRecordValueType;
  required: boolean;
  handling: AutomationStudioRecordFieldHandling;
};

/** The longest id `AUTOMATION_STUDIO_RECORD_SCHEMA_LIMITS.fieldIdPattern` accepts. */
const FIELD_ID_MAX_LENGTH = 100;

/** A draft with every required setting empty and no fields; saving stays on. */
export function newRecordOutputDraft(): AutomationStudioRecordOutput {
  return recordOutput({ datasetId: "", label: "", recordsPath: "", writeMode: "append", maxRecords: null }, [], []);
}

/**
 * Reads a stored parameter value into a draft, or `null` when saving is off.
 * Parts that cannot be read fall back to empty settings; the parser still
 * reports the stored value itself, so nothing invalid is hidden.
 */
export function readRecordOutputDraft(value: unknown): AutomationStudioRecordOutput | null {
  if (value === null || value === undefined) return null;
  const source = plainRecord(value);
  const schema = plainRecord(source.schema);
  const fields = Array.isArray(schema.fields) ? schema.fields.map(readField) : [];
  const primaryKey = Array.isArray(schema.primaryKey) ? schema.primaryKey.filter((id): id is string => typeof id === "string") : [];
  return recordOutput({
    datasetId: text(source.datasetId),
    label: text(source.label),
    recordsPath: text(source.recordsPath),
    writeMode: isWriteMode(source.writeMode) ? source.writeMode : "append",
    maxRecords: typeof source.maxRecords === "number" ? source.maxRecords : null
  }, fields, primaryKey);
}

/** Off writes `null`, so the action payload carries no record output. On keeps a stored draft or starts a new one. */
export function toggleRecordOutput(value: unknown, enabled: boolean): AutomationStudioRecordOutput | null {
  if (!enabled) return null;
  return readRecordOutputDraft(value) ?? newRecordOutputDraft();
}

export function updateRecordOutputSettings(output: AutomationStudioRecordOutput, change: RecordOutputSettingsChange): AutomationStudioRecordOutput {
  const current = settingsOf(output);
  return recordOutput({
    datasetId: change.datasetId ?? current.datasetId,
    label: change.label ?? current.label,
    recordsPath: change.recordsPath ?? current.recordsPath,
    writeMode: change.writeMode ?? current.writeMode,
    maxRecords: change.maxRecords === undefined ? current.maxRecords : change.maxRecords
  }, copyFields(output), copyKey(output));
}

/** Appends a Text field with a unique name and id; at the field limit the draft is returned unchanged. */
export function addRecordField(output: AutomationStudioRecordOutput): AutomationStudioRecordOutput {
  const fields = copyFields(output);
  if (fields.length >= AUTOMATION_STUDIO_RECORD_SCHEMA_LIMITS.maxFields) return output;
  const labels = new Set(fields.map((field) => field.label));
  let number = fields.length + 1;
  while (labels.has("Field " + number)) number += 1;
  const label = "Field " + number;
  fields.push(recordField({ id: deriveRecordFieldId(label, fields.map((field) => field.id)), label, valueType: "string", required: false, handling: "include" }));
  return recordOutput(settingsOf(output), fields, copyKey(output));
}

/** Removes one field; when it was the key, the key is cleared. */
export function removeRecordField(output: AutomationStudioRecordOutput, index: number): AutomationStudioRecordOutput {
  const removed = output.schema.fields[index];
  if (!removed) return output;
  const fields = copyFields(output).filter((_field, fieldIndex) => fieldIndex !== index);
  const primaryKey = copyKey(output).filter((id) => id !== removed.id || fields.some((field) => field.id === id));
  return recordOutput(settingsOf(output), fields, primaryKey);
}

/** Moves one field a step up (-1) or down (1); column order is the CSV column order. */
export function moveRecordField(output: AutomationStudioRecordOutput, index: number, offset: -1 | 1): AutomationStudioRecordOutput {
  const fields = copyFields(output);
  const target = index + offset;
  const moved = fields[index];
  if (!moved || target < 0 || target >= fields.length) return output;
  fields.splice(index, 1);
  fields.splice(target, 0, moved);
  return recordOutput(settingsOf(output), fields, copyKey(output));
}

/**
 * Changes a field's name, id, value type, or required flag. Renaming also
 * renames the id while the id is still the one derived from the old name; an
 * id the user typed is kept. A renamed key field stays the key.
 */
export function updateRecordField(output: AutomationStudioRecordOutput, index: number, change: RecordFieldChange): AutomationStudioRecordOutput {
  const current = output.schema.fields[index];
  if (!current) return output;
  const parts = partsOf(current);
  const otherIds = output.schema.fields.filter((_field, fieldIndex) => fieldIndex !== index).map((field) => field.id);
  const label = change.label ?? parts.label;
  const followsName = change.label !== undefined && change.id === undefined
    && (parts.id === "" || parts.id === deriveRecordFieldId(parts.label, otherIds));
  const id = followsName ? deriveRecordFieldId(label, otherIds) : change.id ?? parts.id;
  const fields = copyFields(output);
  fields[index] = recordField({
    id,
    label,
    valueType: change.valueType ?? parts.valueType,
    required: change.required ?? parts.required,
    handling: parts.handling
  });
  const primaryKey = copyKey(output).map((keyId) => keyId === parts.id ? id : keyId);
  return recordOutput(settingsOf(output), fields, primaryKey);
}

/**
 * Sets Include, Exclude column, or Encrypt column. An excluded field stays in
 * the schema with `handling: "exclude"`; storage drops it. A field that is no
 * longer included cannot be the key, so the key is cleared.
 */
export function setRecordFieldHandling(output: AutomationStudioRecordOutput, index: number, handling: AutomationStudioRecordFieldHandling): AutomationStudioRecordOutput {
  const current = output.schema.fields[index];
  if (!current) return output;
  const parts = partsOf(current);
  const fields = copyFields(output);
  fields[index] = recordField({ id: parts.id, label: parts.label, valueType: parts.valueType, required: parts.required, handling });
  const primaryKey = handling === "include" ? copyKey(output) : copyKey(output).filter((id) => id !== parts.id);
  return recordOutput(settingsOf(output), fields, primaryKey);
}

/** One field id as the single primary key, or `null` for no key. */
export function setRecordPrimaryKey(output: AutomationStudioRecordOutput, fieldId: string | null): AutomationStudioRecordOutput {
  return recordOutput(settingsOf(output), copyFields(output), fieldId === null ? [] : [fieldId]);
}

/** A field id from a name: lower-case letters, digits, and `_`, unique among `takenIds` and never a reserved id. */
export function deriveRecordFieldId(label: string, takenIds: readonly string[]): string {
  const taken = new Set(takenIds);
  const reserved: ReadonlySet<string> = new Set(AUTOMATION_STUDIO_RECORD_SCHEMA_LIMITS.reservedFieldIds);
  const base = label.trim().toLowerCase().replace(/[^a-z0-9]+/gu, "_").replace(/^_+|_+$/gu, "").slice(0, FIELD_ID_MAX_LENGTH) || "field";
  const available = (candidate: string) => !taken.has(candidate) && !reserved.has(candidate);
  if (available(base)) return base;
  for (let number = 2; ; number += 1) {
    const suffix = "_" + number;
    const candidate = base.slice(0, FIELD_ID_MAX_LENGTH - suffix.length) + suffix;
    if (available(candidate)) return candidate;
  }
}

function recordOutput(settings: OutputSettings, fields: AutomationStudioRecordField[], primaryKey: string[]): AutomationStudioRecordOutput {
  const schema: AutomationStudioRecordSchema = { schemaVersion: "0.1", fields };
  if (primaryKey.length > 0) schema.primaryKey = primaryKey;
  const output: AutomationStudioRecordOutput = {
    datasetId: settings.datasetId,
    recordsPath: settings.recordsPath,
    schema,
    writeMode: settings.writeMode
  };
  if (settings.label.trim() !== "") output.label = settings.label;
  if (settings.maxRecords !== null) output.maxRecords = settings.maxRecords;
  return output;
}

function recordField(parts: FieldParts): AutomationStudioRecordField {
  const field: AutomationStudioRecordField = { id: parts.id, label: parts.label, valueType: parts.valueType };
  if (parts.required) field.required = true;
  if (parts.handling !== "include") field.handling = parts.handling;
  return field;
}

function settingsOf(output: AutomationStudioRecordOutput): OutputSettings {
  return {
    datasetId: output.datasetId,
    label: output.label ?? "",
    recordsPath: output.recordsPath,
    writeMode: output.writeMode,
    maxRecords: output.maxRecords ?? null
  };
}

function partsOf(field: AutomationStudioRecordField): FieldParts {
  return {
    id: field.id,
    label: field.label,
    valueType: field.valueType,
    required: field.required === true,
    handling: field.handling ?? "include"
  };
}

function copyFields(output: AutomationStudioRecordOutput): AutomationStudioRecordField[] {
  return output.schema.fields.map((field) => recordField(partsOf(field)));
}

function copyKey(output: AutomationStudioRecordOutput): string[] {
  return [...(output.schema.primaryKey ?? [])];
}

function readField(value: unknown): AutomationStudioRecordField {
  const source = plainRecord(value);
  return recordField({
    id: text(source.id),
    label: text(source.label),
    valueType: isValueType(source.valueType) ? source.valueType : "string",
    required: source.required === true,
    handling: isHandling(source.handling) ? source.handling : "include"
  });
}

function plainRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isValueType(value: unknown): value is AutomationStudioRecordValueType {
  return typeof value === "string" && (AUTOMATION_STUDIO_RECORD_VALUE_TYPES as readonly string[]).includes(value);
}

function isHandling(value: unknown): value is AutomationStudioRecordFieldHandling {
  return typeof value === "string" && (AUTOMATION_STUDIO_RECORD_FIELD_HANDLINGS as readonly string[]).includes(value);
}

function isWriteMode(value: unknown): value is AutomationStudioRecordWriteMode {
  return typeof value === "string" && (AUTOMATION_STUDIO_RECORD_WRITE_MODES as readonly string[]).includes(value);
}
