import { compareValues } from "./shared";
import { defineBuiltinNode, emptyResult } from "../shared/definition";

export const compareNode = defineBuiltinNode({
  id: "builtin.logic.compare",
  label: "Compare",
  description: "Compare two values with a selected operator.",
  class: "logic",
  scope: "both",
  inputs: [
    { id: "left", label: "Left", valueType: "any", required: true },
    { id: "right", label: "Right", valueType: "any", required: true }
  ],
  outputs: [{ id: "result", label: "Result", valueType: "boolean" }],
  parameters: [
    {
      id: "operator",
      label: "Operator",
      valueType: "string",
      defaultValue: "equals",
      options: ["equals", "not-equals", "greater-than", "less-than", "contains"].map((value) => ({ label: value, value }))
    }
  ],
  icon: "equal",
  execute: (context) => emptyResult({ result: compareValues(context.inputs.left, context.inputs.right, String(context.parameters.operator ?? "equals")) })
});
