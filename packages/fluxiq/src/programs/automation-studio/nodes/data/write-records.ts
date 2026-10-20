import { parseAutomationStudioRecordOutput, type AutomationStudioFailureRecord } from "@fluxiq/contracts/automation-studio";
import type { JsonValue } from "../../../../core/index.ts";
import type { AutomationNodeExecutionContext, AutomationNodeExecutionResult } from "../contracts.ts";
import { isAutomationNodeParameterStateBinding } from "../parameter-bindings.ts";
import { defineBuiltinNode } from "../shared/definition.ts";

/** Where the `records.write` effect carries the rows, and so the only records path a written record output has. */
const WRITTEN_RECORDS_PATH = "records";

const ENCRYPT_UNAVAILABLE_ISSUE = "record_schema.encrypt_unavailable";
/** How deep a row is searched for a binding left unresolved, as deep as resolution reaches (`../parameter-bindings.ts`). */
const MAXIMUM_ROW_DEPTH = 16;
/** How many field names an unresolved-value failure names. */
const NAMED_FIELDS_MAX = 20;

export const writeRecordsNode = defineBuiltinNode({
  id: "builtin.data.write-records",
  label: "Write Records",
  description: "Save a list of records to a table for this run.",
  class: "data",
  scope: "both",
  // Not required (t738): a script line cannot connect a port, so the rows may
  // come from the records parameter instead.
  inputs: [{ id: "records", label: "Records", valueType: "array", required: false }],
  outputs: [{ id: "records", label: "Records", valueType: "array", role: "data" }],
  parameters: [
    {
      id: "recordOutput",
      label: "Save as table",
      description: "The table these records are saved to, and which fields each record keeps. The records come from the records parameter or the Records input, so a records path is not used.",
      valueType: "json",
      defaultValue: null,
      // A binding could replace the schema, and with it the excluded fields, at run time.
      allowStateBinding: false,
      ui: { control: "record-output" }
    },
    {
      id: "records",
      label: "Rows",
      description: "The rows to save, when nothing is connected to the Records input: a list of objects, one per row, each value written as it is or bound to an earlier step's output with $step.<label>.<output>, so values read one by one are saved as one row.",
      valueType: "array",
      example: [{ name: "$step.name.value", date: "$step.date.value" }]
    }
  ],
  icon: "database",
  execute: (context) => writeRecords(context)
});

// Parsed as Run Output parses its record output, and refused the same way,
// before anything is emitted. The rows travel in the effect as they were given;
// the executor validates them where it captures them.
//
// **Where the rows come from (t738).** The records parameter when it is
// written, and otherwise the Records input. The written rows win because a
// node's inputs also carry every bare value run state holds: a listing earlier
// in the Flow leaves its own `records` there, which would otherwise stand in for
// the rows this step was written with.
function writeRecords(context: AutomationNodeExecutionContext): AutomationNodeExecutionResult {
  const parsed = parseAutomationStudioRecordOutput(withWrittenRecordsPath(context.parameters.recordOutput));
  if (!parsed.ok) return invalidRecordOutput(parsed.issues);
  const written = context.parameters.records;
  if (written === undefined || written === null) {
    if (context.inputs.records === undefined) return refusedRows("record_output.no_records", "Write Records was given no rows: write them in its records parameter or connect its Records input, so no records were saved.");
    return saved(parsed.output, context.inputs.records);
  }
  if (!Array.isArray(written) || !written.every(isRow)) {
    return refusedRows("record_output.invalid_records", "Write Records' rows are a list of objects, one per row, so no records were saved.");
  }
  const unresolved = unresolvedFields(written);
  if (unresolved.length) {
    return refusedRows(
      "record_output.unresolved_value",
      `Write Records has no value for ${unresolved.map((field) => `"${field}"`).join(", ")}: the step it is bound to gave none, so no records were saved.`,
      unresolved
    );
  }
  return saved(parsed.output, written);
}

type ParsedRecordOutput = Extract<ReturnType<typeof parseAutomationStudioRecordOutput>, { ok: true }>["output"];

function saved(recordOutput: ParsedRecordOutput, records: JsonValue): AutomationNodeExecutionResult {
  return { status: "success", route: "success", outputs: {}, effects: [{ type: "records.write", payload: { recordOutput, records } }] };
}

function isRow(value: JsonValue): boolean {
  return typeof value === "object" && value !== null && !Array.isArray(value) && !isAutomationNodeParameterStateBinding(value);
}

/**
 * The fields of the rows that still hold a binding, by name and never by
 * value. The executor resolves every binding before a node runs and fails one
 * it cannot, so this is reached only by a caller that skipped resolution; a row
 * is never saved with a binding in place of its value.
 */
function unresolvedFields(rows: readonly JsonValue[]): string[] {
  const fields = new Set<string>();
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    for (const [field, value] of Object.entries(row)) if (holdsBinding(value, 0)) fields.add(field);
  }
  return [...fields].slice(0, NAMED_FIELDS_MAX);
}

function holdsBinding(value: JsonValue, depth: number): boolean {
  if (isAutomationNodeParameterStateBinding(value)) return true;
  if (!value || typeof value !== "object" || depth >= MAXIMUM_ROW_DEPTH) return false;
  return (Array.isArray(value) ? value : Object.values(value)).some((item) => holdsBinding(item, depth + 1));
}

function refusedRows(code: string, message: string, fields?: string[]): AutomationNodeExecutionResult {
  const failure: AutomationStudioFailureRecord = { category: "graph_validation_or_unknown_node", code, retryable: false };
  return { status: "failed", route: "failed", effects: [], outputs: { error: { code, ...(fields ? { fields } : {}) } }, message, failure };
}

/** The authored record output with its records path replaced, since the rows are not read from a path. */
function withWrittenRecordsPath(value: JsonValue | undefined): JsonValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value ?? null;
  return { ...value, recordsPath: WRITTEN_RECORDS_PATH };
}

function invalidRecordOutput(issues: string[]): AutomationNodeExecutionResult {
  const encryptUnavailable = issues.includes(ENCRYPT_UNAVAILABLE_ISSUE);
  const code = encryptUnavailable ? "record_output.encrypt_unavailable" : "record_output.invalid";
  const failure: AutomationStudioFailureRecord = { category: "graph_validation_or_unknown_node", code, retryable: false };
  return {
    status: "failed",
    route: "failed",
    effects: [],
    outputs: { error: { code, issues } },
    message: encryptUnavailable
      ? "Write Records asks to encrypt a field, which is not available yet, so no records were saved."
      : "Write Records has no valid table to save to, so no records were saved.",
    failure
  };
}
