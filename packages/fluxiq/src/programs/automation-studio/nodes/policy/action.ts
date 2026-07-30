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
    { id: "failure", label: "Failure", valueType: "any" }
  ],
  parameters: [
    { id: "actionDefinitionId", label: "Action definition", valueType: "string", required: true },
    { id: "parameters", label: "Parameters", valueType: "json", defaultValue: {} }
  ],
  icon: "zap",
  privileged: true,
  execute: (context) => ({
    status: "success",
    route: "success",
    outputs: { success: true },
    effects: [{ type: "policy.action.requested", payload: { actionDefinitionId: context.parameters.actionDefinitionId ?? "", parameters: jsonParameter(context.parameters.parameters, {}) } }]
  })
});
