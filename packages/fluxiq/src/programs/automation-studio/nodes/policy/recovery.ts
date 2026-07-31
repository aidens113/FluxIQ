import { defineBuiltinNode } from "../shared/definition";

export const recoveryNode = defineBuiltinNode({
  id: "builtin.policy.recovery",
  label: "Recovery",
  description: "Choose how to recover after a failed task action.",
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
      label: "Recovery strategy",
      description: "What this policy should try after a failure.",
      valueType: "string",
      defaultValue: "retry",
      options: [
        { label: "Try the failed step again", value: "retry" },
        { label: "Run a fallback action", value: "fallback-action" },
        { label: "Stop this policy", value: "abort" }
      ]
    },
    { id: "maxAttempts", label: "Maximum tries", description: "How many total attempts are allowed when retrying.", valueType: "number", defaultValue: 2 },
    { id: "fallbackActionDefinitionId", label: "Fallback action", description: "Action to run when the fallback strategy is selected.", valueType: "string", defaultValue: "", ui: { control: "reference", referenceType: "action", placeholder: "Choose fallback action" } }
  ],
  icon: "shield-check",
  execute: (context) => ({ status: "success", route: context.parameters.strategy === "abort" ? "failed" : "recovered", outputs: { recovered: context.inputs.failure ?? null, strategy: context.parameters.strategy ?? "retry", maxAttempts: context.parameters.maxAttempts ?? 2, fallbackActionDefinitionId: context.parameters.fallbackActionDefinitionId ?? "" } })
});
