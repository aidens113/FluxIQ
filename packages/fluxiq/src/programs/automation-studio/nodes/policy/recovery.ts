import { defineBuiltinNode } from "../shared/definition";

export const recoveryNode = defineBuiltinNode({
  id: "builtin.policy.recovery",
  label: "Recovery",
  description: "Route a failed policy node to a recovery branch.",
  class: "policy",
  scope: "policy",
  inputs: [{ id: "failure", label: "Failure", valueType: "any" }],
  outputs: [
    { id: "recovered", label: "Recovered", valueType: "any" },
    { id: "failed", label: "Failed", valueType: "any" }
  ],
  parameters: [
    {
      id: "strategy",
      label: "Strategy",
      valueType: "string",
      defaultValue: "retry",
      options: [
        { label: "Retry", value: "retry" },
        { label: "Fallback action", value: "fallback-action" },
        { label: "Abort policy", value: "abort" }
      ]
    },
    { id: "maxAttempts", label: "Max attempts", valueType: "number", defaultValue: 2 },
    { id: "fallbackActionDefinitionId", label: "Fallback action", valueType: "string", defaultValue: "", ui: { control: "reference", referenceType: "action", placeholder: "action.id" } }
  ],
  icon: "shield-check",
  execute: (context) => ({ status: "success", route: context.parameters.strategy === "abort" ? "failed" : "recovered", outputs: { recovered: context.inputs.failure ?? null, strategy: context.parameters.strategy ?? "retry", maxAttempts: context.parameters.maxAttempts ?? 2, fallbackActionDefinitionId: context.parameters.fallbackActionDefinitionId ?? "" } })
});
