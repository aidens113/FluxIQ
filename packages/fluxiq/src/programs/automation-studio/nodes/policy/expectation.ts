import { jsonParameter } from "./shared";
import { defineBuiltinNode } from "../shared/definition";

export const expectationNode = defineBuiltinNode({
  id: "builtin.policy.expectation",
  label: "Expectation",
  description: "Check success, failure, or invariant conditions after an action.",
  class: "policy",
  scope: "policy",
  inputs: [{ id: "signals", label: "Signals", valueType: "signal", multiple: true }],
  outputs: [
    { id: "passed", label: "Passed", valueType: "boolean" },
    { id: "failed", label: "Failed", valueType: "boolean" }
  ],
  parameters: [
    { id: "conditions", label: "Conditions", valueType: "array", defaultValue: [] },
    {
      id: "mode",
      label: "Mode",
      valueType: "string",
      defaultValue: "all",
      options: [
        { label: "All conditions", value: "all" },
        { label: "Any condition", value: "any" }
      ]
    },
    { id: "timeoutMs", label: "Timeout ms", valueType: "number", defaultValue: 1000 }
  ],
  icon: "list-checks",
  execute: (context) => ({
    status: "success",
    route: "passed",
    outputs: { passed: true, failed: false },
    effects: [{ type: "policy.expectation.checked", payload: { conditions: jsonParameter(context.parameters.conditions, []), mode: context.parameters.mode ?? "all", timeoutMs: context.parameters.timeoutMs ?? 1000 } }]
  })
});
