/** The value types a record field can hold. */
export const AUTOMATION_STUDIO_RECORD_VALUE_TYPES = Object.freeze(["string", "number", "boolean", "url", "datetime", "json"] as const);

export type AutomationStudioRecordValueType = (typeof AUTOMATION_STUDIO_RECORD_VALUE_TYPES)[number];

/**
 * What happens to a field's value. `include` (the default) keeps it. `exclude`
 * keeps it out of node outputs, stored rows, the stored schema, previews, and
 * exports. `encrypt` is refused until record keys exist (K11).
 */
export const AUTOMATION_STUDIO_RECORD_FIELD_HANDLINGS = Object.freeze(["include", "exclude", "encrypt"] as const);

export type AutomationStudioRecordFieldHandling = (typeof AUTOMATION_STUDIO_RECORD_FIELD_HANDLINGS)[number];

/** Bounds `parseAutomationStudioRecordSchema` enforces. A schema that exceeds them is rejected, not trimmed. */
export const AUTOMATION_STUDIO_RECORD_SCHEMA_LIMITS = Object.freeze({
  maxFields: 200,
  /** Letters, digits, `_`, and `-`, 1-100 characters. */
  fieldIdPattern: /^[A-Za-z0-9_-]{1,100}$/u,
  /** Ids that collide with object machinery when a row is read by key; refused. */
  reservedFieldIds: Object.freeze(["__proto__", "constructor", "prototype"] as const),
  labelMaxLength: 200
});

export type AutomationStudioRecordField = {
  /** Stable key of the value in a stored row. Unique within the schema. */
  id: string;
  /** Human-readable column name, used as the CSV header. Unique within the schema. */
  label: string;
  valueType: AutomationStudioRecordValueType;
  /** A row missing a required field is invalid. */
  required?: boolean;
  handling?: AutomationStudioRecordFieldHandling;
};

/**
 * The shape of every row in one dataset. Validate any value that crossed a
 * process or storage boundary with `parseAutomationStudioRecordSchema`.
 */
export type AutomationStudioRecordSchema = {
  schemaVersion: "0.1";
  fields: AutomationStudioRecordField[];
  /** Field ids that identify a row. Never an `exclude` or `encrypt` field. */
  primaryKey?: string[];
};
