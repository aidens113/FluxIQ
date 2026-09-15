import { parseAutomationStudioRecordOutput, type AutomationStudioFailureRecord } from "@fluxiq/contracts/automation-studio";
import type { JsonValue } from "../../../../core/index.ts";
import type { AutomationNodeExecutionContext, AutomationNodeExecutionResult } from "../contracts.ts";
import { defineBuiltinNode } from "../shared/definition.ts";

/** Where the `records.write` effect carries the rows, and so the only records path a written record output has. */
const WRITTEN_RECORDS_PATH = "records";

const ENCRYPT_UNAVAILABLE_ISSUE = "record_schema.encrypt_unavailable";

export const writeRecordsNode = defineBuiltinNode({
  id: "builtin.data.write-records",
  label: "Write Records",
  description: "Save a list of records to a table for this run.",
  class: "data",
  scope: "both",
  inputs: [{ id: "records", label: "Records", valueType: "array", required: true }],
  outputs: [{ id: "records", label: "Records", valueType: "array", role: "data" }],
  parameters: [
    {
      id: "recordOutput",
      label: "Save as table",
      description: "The table these records are saved to, and which fields each record keeps. The records come from the Records input, so a records path is not used.",
      valueType: "json",
      defaultValue: null,
      // A binding could replace the schema, and with it the excluded fields, at run time.
      allowStateBinding: false,
      ui: { control: "record-output" }
    }
  ],
  icon: "database",
  execute: (context) => writeRecords(context)
});

// Parsed as Run Output parses its record output, and refused the same way,
// before anything is emitted. The rows travel in the effect as the input holds
// them; the executor validates them where it captures them.
function writeRecords(context: AutomationNodeExecutionContext): AutomationNodeExecutionResult {
  const parsed = parseAutomationStudioRecordOutput(withWrittenRecordsPath(context.parameters.recordOutput));
  if (!parsed.ok) return invalidRecordOutput(parsed.issues);
  return {
    status: "success",
    route: "success",
    outputs: {},
    effects: [{ type: "records.write", payload: { recordOutput: parsed.output, records: context.inputs.records ?? null } }]
  };
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
