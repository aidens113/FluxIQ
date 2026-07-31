import { jsonParameter } from "./shared";
import { defineBuiltinNode } from "../shared/definition";

export const actionNode = defineBuiltinNode({
  id: "builtin.policy.action",
  label: "Action",
  description: "Dispatch a domain-provided action through a declared channel.",
  class: "policy",
  scope: "policy",
  inputs: [{ id: "ready", label: "Ready", valueType: "boolean" }],
  outputs: [
    { id: "success", label: "Success", valueType: "any" },
    { id: "failed", label: "Failed", valueType: "any" }
  ],
  parameters: [
    { id: "actionDefinitionId", label: "Action definition", valueType: "string", required: true, ui: { control: "reference", referenceType: "action", placeholder: "action.id" } },
    { id: "parameters", label: "Action parameters", valueType: "object", defaultValue: {} },
    { id: "timeoutMs", label: "Timeout ms", valueType: "number", defaultValue: 5000 },
    { id: "requiresApproval", label: "Requires approval", valueType: "boolean", defaultValue: false },
    {
      id: "failureRoute",
      label: "Failure route",
      valueType: "string",
      defaultValue: "failed",
      options: [
        { label: "Failed", value: "failed" },
        { label: "Success", value: "success" }
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
