import { booleanValue, defineBuiltinNode, emptyResult } from "../shared/definition";

export const notNode = defineBuiltinNode({
  id: "builtin.logic.not",
  label: "Not",
  description: "Invert a boolean condition.",
  class: "logic",
  scope: "both",
  inputs: [{ id: "condition", label: "Condition", valueType: "boolean", required: true }],
  outputs: [{ id: "result", label: "Result", valueType: "boolean" }],
  parameters: [],
  icon: "badge-x",
  execute: (context) => emptyResult({ result: !booleanValue(context.inputs.condition) })
});
