import { jsonParameter } from "./shared";
import { defineBuiltinNode } from "../shared/definition";

export const actionNode = defineBuiltinNode({
  id: "builtin.policy.action",
  label: "Run Action",
  description: "Ask a host adapter to perform one task action.",
  class: "policy",
  scope: "policy",
  inputs: [{ id: "ready", label: "Ready", valueType: "boolean" }],
  outputs: [
    { id: "success", label: "Success", valueType: "any" },
    { id: "failed", label: "Failed", valueType: "any" }
  ],
  parameters: [
    { id: "actionDefinitionId", label: "Action to run", description: "Choose the host-provided action this node should request.", valueType: "string", required: true, ui: { control: "reference", referenceType: "action", placeholder: "Choose an action" } },
    { id: "parameters", label: "Action settings", description: "Values passed to the selected action.", valueType: "object", defaultValue: {} },
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
    effects: [{ type: "policy.action.requested", payload: { actionDefinitionId: context.parameters.actionDefinitionId ?? "", parameters: jsonParameter(context.parameters.parameters, {}), timeoutMs: context.parameters.timeoutMs ?? 5000, requiresApproval: context.parameters.requiresApproval === true, failureRoute: context.parameters.failureRoute ?? "failed" } }]
  })
});
