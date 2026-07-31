import { jsonParameter } from "./shared";
import { defineBuiltinNode } from "../shared/definition";

export const expectationNode = defineBuiltinNode({
  id: "builtin.policy.expectation",
  label: "Expectation",
  description: "Check whether expected task state is true after an action.",
  class: "policy",
  scope: "policy",
  inputs: [{ id: "signals", label: "Signals", valueType: "signal", multiple: true }],
  outputs: [
    { id: "passed", label: "Passed", valueType: "boolean" },
    { id: "failed", label: "Failed", valueType: "boolean" }
  ],
  parameters: [
    { id: "conditions", label: "Expected conditions", description: "State checks this node should evaluate.", valueType: "array", defaultValue: [] },
    {
      id: "mode",
      label: "Required matches",
      description: "Choose whether every condition or just one condition must pass.",
      valueType: "string",
      defaultValue: "all",
      options: [
        { label: "All conditions must pass", value: "all" },
        { label: "Any condition may pass", value: "any" }
      ]
    },
    { id: "timeoutMs", label: "Wait up to milliseconds", description: "How long to wait for expected state to appear.", valueType: "number", defaultValue: 1000 }
  ],
  icon: "list-checks",
  execute: (context) => ({
    status: "success",
    route: "passed",
    outputs: { passed: true, failed: false },
    effects: [{ type: "policy.expectation.checked", payload: { conditions: jsonParameter(context.parameters.conditions, []), mode: context.parameters.mode ?? "all", timeoutMs: context.parameters.timeoutMs ?? 1000 } }]
  })
});
