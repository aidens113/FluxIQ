import { booleanValue, defineBuiltinNode } from "../shared/definition.ts";

export const notNode = defineBuiltinNode({
  id: "builtin.logic.not",
  label: "Not",
  description: "Invert a boolean condition.",
  class: "logic",
  scope: "both",
  inputs: [{ id: "condition", label: "Condition", valueType: "boolean", required: true }],
  outputs: [
    { id: "true", label: "True", valueType: "any" },
    { id: "false", label: "False", valueType: "any" },
    { id: "result", label: "Result", valueType: "boolean" }
  ],
  parameters: [{ id: "missingValue", label: "If condition is missing", description: "Boolean value to assume before this node flips it.", valueType: "boolean", defaultValue: false }],
  icon: "badge-x",
  execute: (context) => {
    const value = context.inputs.condition === undefined ? context.parameters.missingValue : context.inputs.condition;
    const result = !booleanValue(value);
    return { status: "success", route: result ? "true" : "false", outputs: { result } };
  }
});
