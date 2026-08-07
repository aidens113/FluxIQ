import { jsonParameter } from "./shared.ts";
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
    { id: "failed", label: "Failed", valueType: "any" }
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
    }
  ],
  icon: "zap",
  privileged: true,
  execute: (context) => ({
    status: "success",
    route: "success",
    outputs: { success: true },
    effects: [{ type: "policy.output.dispatch", payload: { outputId: context.parameters.outputId ?? "", parameters: jsonParameter(context.parameters.parameters, {}), confirmationInputId: context.parameters.confirmationInputId ?? "", confirmationTimeoutMs: context.parameters.confirmationTimeoutMs ?? 5000, timeoutMs: context.parameters.timeoutMs ?? 5000, requiresApproval: context.parameters.requiresApproval === true, failureRoute: context.parameters.failureRoute ?? "failed" } }]
  })
});
