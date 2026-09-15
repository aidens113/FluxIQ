import {
  AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS,
  AUTOMATION_STUDIO_RECORD_SCHEMA_LIMITS,
  parseAutomationStudioRecordOutput
} from "fluxiq/automation-studio/nodes";

const MAX_RECORDS = AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS.maxRecordsCeiling.toLocaleString("en-US");
const MAX_FIELDS = AUTOMATION_STUDIO_RECORD_SCHEMA_LIMITS.maxFields.toLocaleString("en-US");
const INVALID = "These record settings cannot be read. Turn Save extracted records off and on to start again.";

// Plain messages for K1's stable issue codes. A code missing here still shows
// the generic message, so a new parser code never hides an invalid value.
const MESSAGES: Readonly<Record<string, string>> = {
  "record_output.invalid": INVALID,
  "record_output.not_object": INVALID,
  "record_output.unknown_key": "These record settings contain a setting this editor does not support.",
  "record_output.invalid_dataset_id": "Enter a table id of up to 200 letters, numbers, dots, dashes, colons, or underscores.",
  "record_output.invalid_label": "Enter a table name of up to 200 characters, or leave it blank.",
  "record_output.missing_records_path": "Enter the records path: where the list of rows sits inside the node's result.",
  "record_output.invalid_records_path": "Enter the records path as up to 8 dot-separated names using letters, numbers, dashes, or underscores.",
  "record_output.invalid_write_mode": "Choose Append or Replace.",
  "record_output.invalid_max_records": "Enter a whole number of 1 or more for max records.",
  "record_output.max_records_above_ceiling": "Max records cannot be more than " + MAX_RECORDS + ".",
  "record_schema.invalid": INVALID,
  "record_schema.not_object": INVALID,
  "record_schema.invalid_fields": INVALID,
  "record_schema.invalid_schema_version": INVALID,
  "record_schema.unknown_key": "The fields table contains a setting this editor does not support.",
  "record_schema.no_fields": "Add at least one field.",
  "record_schema.too_many_fields": "Use no more than " + MAX_FIELDS + " fields.",
  "record_schema.invalid_field": "A field cannot be read. Remove it and add it again.",
  "record_schema.unknown_field_key": "A field contains a setting this editor does not support.",
  "record_schema.invalid_field_id": "Give every field an id of up to 100 letters, numbers, dashes, or underscores.",
  "record_schema.reserved_field_id": "The field ids __proto__, constructor, and prototype are reserved. Choose another id.",
  "record_schema.invalid_field_label": "Give every field a name of up to 200 characters.",
  "record_schema.invalid_value_type": "Choose a value type for every field.",
  "record_schema.invalid_required": "A field's Required setting cannot be read.",
  "record_schema.invalid_handling": "Choose Include, Exclude column, or Encrypt column for every field.",
  "record_schema.encrypt_unavailable": "Encrypt column is not available yet: it arrives with project record keys. Choose Include or Exclude column.",
  "record_schema.duplicate_field_id": "Two fields have the same id. Field ids must be unique.",
  "record_schema.duplicate_field_label": "Two fields have the same name. Field names must be unique.",
  "record_schema.no_stored_fields": "Every field is excluded. Include at least one field.",
  "record_schema.invalid_primary_key": "The key cannot be read. Choose the key field again.",
  "record_schema.primary_key_duplicate_field": "The key lists the same field twice. Choose the key field again.",
  "record_schema.primary_key_unknown_field": "The key field no longer exists. Choose the key field again.",
  "record_schema.primary_key_excluded_field": "An excluded column cannot be the key.",
  "record_schema.primary_key_encrypted_field": "An encrypted column cannot be the key."
};

/**
 * The error the Inspector and Graph Problems show for a `record-output`
 * parameter. It runs K1's parser exactly as the policy action does (no
 * `allowEncrypt`), so the editor flags what the node would refuse. Absent or
 * `null` means saving is off and is never an error.
 */
export function recordOutputParameterError(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const parsed = parseAutomationStudioRecordOutput(value);
  if (parsed.ok) return null;
  const messages = new Set(parsed.issues.map((issue) => MESSAGES[issue] ?? INVALID));
  return [...messages].join(" ");
}
