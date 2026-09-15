import { isPlainRecord } from "./is-plain-record.ts";
import {
  AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS,
  AUTOMATION_STUDIO_RECORD_WRITE_MODES,
  type AutomationStudioRecordOutput,
  type AutomationStudioRecordWriteMode
} from "./output.ts";
import { parseAutomationStudioRecordSchema, type AutomationStudioRecordParseOptions } from "./parse-schema.ts";
import { parseAutomationStudioRecordsPath } from "./records-path.ts";

export type AutomationStudioRecordOutputParseResult =
  | { ok: true; output: AutomationStudioRecordOutput }
  | { ok: false; issues: string[] };

const OUTPUT_KEYS: ReadonlySet<string> = new Set(["datasetId", "label", "recordsPath", "schema", "writeMode", "maxRecords"]);
const WRITE_MODES: ReadonlySet<string> = new Set(AUTOMATION_STUDIO_RECORD_WRITE_MODES);

/**
 * Parses an untrusted value into a record output, returning fresh objects.
 *
 * Exact fields, as for the schema. Issues are stable codes prefixed
 * `record_output.`, each listed once; the nested schema's issues keep their
 * `record_schema.` codes, so `record_schema.encrypt_unavailable` reaches the
 * caller unchanged. `recordsPath` is required.
 */
export function parseAutomationStudioRecordOutput(value: unknown, options: AutomationStudioRecordParseOptions = {}): AutomationStudioRecordOutputParseResult {
  const issues = new Set<string>();
  let output: AutomationStudioRecordOutput | null;
  try {
    output = parseOutput(value, options, issues);
  } catch {
    issues.add("record_output.invalid");
    output = null;
  }
  if (output === null || issues.size > 0) return { ok: false, issues: issues.size > 0 ? [...issues] : ["record_output.invalid"] };
  return { ok: true, output };
}

function parseOutput(value: unknown, options: AutomationStudioRecordParseOptions, issues: Set<string>): AutomationStudioRecordOutput | null {
  if (!isPlainRecord(value)) {
    issues.add("record_output.not_object");
    return null;
  }
  if (!Object.keys(value).every((key) => OUTPUT_KEYS.has(key))) issues.add("record_output.unknown_key");
  const { datasetId, label, recordsPath, schema, writeMode, maxRecords } = value;
  if (!isDatasetId(datasetId)) issues.add("record_output.invalid_dataset_id");
  if (label !== undefined && !isLabel(label)) issues.add("record_output.invalid_label");
  if (recordsPath === undefined) issues.add("record_output.missing_records_path");
  else if (parseAutomationStudioRecordsPath(recordsPath) === null) issues.add("record_output.invalid_records_path");
  if (!isWriteMode(writeMode)) issues.add("record_output.invalid_write_mode");
  if (maxRecords !== undefined) {
    if (typeof maxRecords !== "number" || !Number.isInteger(maxRecords) || maxRecords < 1) issues.add("record_output.invalid_max_records");
    else if (maxRecords > AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS.maxRecordsCeiling) issues.add("record_output.max_records_above_ceiling");
  }
  const parsedSchema = parseAutomationStudioRecordSchema(schema, options);
  if (!parsedSchema.ok) for (const issue of parsedSchema.issues) issues.add(issue);
  if (issues.size > 0 || !parsedSchema.ok || !isDatasetId(datasetId) || typeof recordsPath !== "string" || !isWriteMode(writeMode)) return null;
  const output: AutomationStudioRecordOutput = { datasetId, recordsPath, schema: parsedSchema.schema, writeMode };
  if (typeof label === "string") output.label = label;
  if (typeof maxRecords === "number") output.maxRecords = maxRecords;
  return output;
}

function isDatasetId(value: unknown): value is string {
  return typeof value === "string" && value !== "." && value !== ".." && AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS.datasetIdPattern.test(value);
}

function isLabel(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS.labelMaxLength;
}

function isWriteMode(value: unknown): value is AutomationStudioRecordWriteMode {
  return typeof value === "string" && WRITE_MODES.has(value);
}
