import {
  parseAutomationStudioRecordOutput,
  type AutomationStudioFailureRecord,
  type AutomationStudioRecordOutput
} from "@fluxiq/contracts/automation-studio";
import { jsonParameter } from "./shared.ts";
import type { AutomationNodeExecutionResult } from "../contracts.ts";
import type { JsonValue } from "../../../../core/index.ts";
import { defineBuiltinNode } from "../shared/definition.ts";

export const actionNode = defineBuiltinNode({
  id: "builtin.policy.action",
  label: "Run Output",
  description: "Dispatch one importer-registered domain output.",
  class: "policy",
  scope: "policy",
  inputs: [{ id: "ready", label: "Ready", valueType: "boolean" }],
  outputs: [
    { id: "success", label: "Success", valueType: "any" },
    { id: "failed", label: "Failed", valueType: "any" },
    { id: "records", label: "Records", valueType: "array", role: "data" }
  ],
  parameters: [
    { id: "outputId", label: "Output to run", description: "Choose an importer-registered output node.", valueType: "string", required: true, ui: { control: "reference", referenceType: "action", placeholder: "Choose an output" } },
    { id: "parameters", label: "Output payload", description: "Values passed to the selected output.", valueType: "object", defaultValue: {} },
    { id: "confirmationInputId", label: "Confirmation input", description: "Action input stream that confirms the output occurred. Leave empty for no confirmation.", valueType: "string", defaultValue: "", ui: { control: "identifier", placeholder: "Registered action input ID" } },
    { id: "confirmationTimeoutMs", label: "Confirmation timeout", description: "How long to wait for the confirmation input.", valueType: "number", defaultValue: 5000 },
    { id: "timeoutMs", label: "Give up after milliseconds", description: "Maximum time to wait before treating this action as failed.", valueType: "number", defaultValue: 5000 },
    { id: "requiresApproval", label: "Ask before running", description: "Require operator approval before this action executes.", valueType: "boolean", defaultValue: false },
    {
      id: "failureRoute",
      label: "If the action fails",
      description: "Usually failed. Success is available for intentionally ignoring errors.",
      valueType: "string",
      defaultValue: "failed",
      options: [
        { label: "Go to Failed", value: "failed" },
        { label: "Continue as Success", value: "success" }
      ]
    },
    {
      id: "recordOutput",
      label: "Save extracted records",
      description: "Save the records this output returns as a table. Leave off to save none.",
      valueType: "json",
      defaultValue: null,
      // A binding could replace the schema, and with it the excluded fields, at run time.
      allowStateBinding: false,
      ui: { control: "record-output" }
    }
  ],
  icon: "zap",
  privileged: true,
  execute: (context) => {
    const recordOutput = readRecordOutput(context.parameters.recordOutput);
    if (!recordOutput.ok) return recordOutputFailure(recordOutput.issues);
    const payload: Record<string, JsonValue> = {
      outputId: context.parameters.outputId ?? "",
      parameters: jsonParameter(context.parameters.parameters, {}),
      confirmationInputId: context.parameters.confirmationInputId ?? "",
      confirmationTimeoutMs: context.parameters.confirmationTimeoutMs ?? 5000,
      timeoutMs: context.parameters.timeoutMs ?? 5000,
      requiresApproval: context.parameters.requiresApproval === true,
      failureRoute: context.parameters.failureRoute ?? "failed"
    };
    // The runtime withholds the saved result payload of any dispatch whose
    // recordOutput is present and not null, so an action saving no records
    // must leave the key out rather than send an empty value.
    if (recordOutput.output !== null) payload.recordOutput = recordOutput.output;
    return {
      status: "success",
      route: "success",
      outputs: { success: true },
      effects: [{ type: "policy.output.dispatch", payload }]
    };
  }
});

type RecordOutputReading =
  | { ok: true; output: AutomationStudioRecordOutput | null }
  | { ok: false; issues: string[] };

const ENCRYPT_UNAVAILABLE_ISSUE = "record_schema.encrypt_unavailable";

// Absent and null both mean no records are saved. Any other value must parse,
// and encrypted fields are refused: nothing can seal a record field yet.
function readRecordOutput(value: JsonValue | undefined): RecordOutputReading {
  if (value === undefined || value === null) return { ok: true, output: null };
  return parseAutomationStudioRecordOutput(value);
}

// An invalid record output fails the node before anything is dispatched,
// whatever the failure route says, because running the output would collect
// records that cannot be saved as declared.
function recordOutputFailure(issues: string[]): AutomationNodeExecutionResult {
  const encryptUnavailable = issues.includes(ENCRYPT_UNAVAILABLE_ISSUE);
  const code = encryptUnavailable ? "record_output.encrypt_unavailable" : "record_output.invalid";
  const failure: AutomationStudioFailureRecord = {
    category: "graph_validation_or_unknown_node",
    code,
    retryable: false,
    stage: "dispatch"
  };
  return {
    status: "failed",
    route: "failed",
    effects: [],
    outputs: { error: { code, issues } },
    message: encryptUnavailable
      ? "Save extracted records asks to encrypt a field, which is not available yet, so the output was not run."
      : "Save extracted records is not a valid record output, so the output was not run.",
    failure
  };
}
