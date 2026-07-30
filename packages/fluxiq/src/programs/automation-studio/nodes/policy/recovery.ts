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
  parameters: [{ id: "strategy", label: "Strategy", valueType: "string", defaultValue: "retry" }],
  icon: "shield-check",
  execute: (context) => ({ status: "success", route: "recovered", outputs: { recovered: context.inputs.failure ?? null, strategy: context.parameters.strategy ?? "retry" } })
});
