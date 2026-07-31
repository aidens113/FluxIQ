import { compareValues } from "./shared";
import { defineBuiltinNode } from "../shared/definition";

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
  outputs: [
    { id: "true", label: "True", valueType: "any" },
    { id: "false", label: "False", valueType: "any" },
    { id: "result", label: "Result", valueType: "boolean" }
  ],
  parameters: [
    {
      id: "operator",
      label: "Operator",
      valueType: "string",
      defaultValue: "equals",
      options: [
        { value: "equals", label: "Equals" },
        { value: "not-equals", label: "Does not equal" },
        { value: "greater-than", label: "Greater than" },
        { value: "greater-than-or-equal", label: "Greater than or equal" },
        { value: "less-than", label: "Less than" },
        { value: "less-than-or-equal", label: "Less than or equal" },
        { value: "contains", label: "Contains" },
        { value: "starts-with", label: "Starts with" },
        { value: "ends-with", label: "Ends with" },
        { value: "exists", label: "Exists" }
      ]
    }
    ,
    { id: "rightDefault", label: "Right default", valueType: "any", defaultValue: null, ui: { control: "value" } },
    { id: "caseSensitive", label: "Case sensitive", valueType: "boolean", defaultValue: true }
  ],
  icon: "equal",
  execute: (context) => {
    const caseSensitive = context.parameters.caseSensitive !== false;
    const left = !caseSensitive && typeof context.inputs.left === "string" ? context.inputs.left.toLowerCase() : context.inputs.left;
    const rawRight = context.inputs.right ?? context.parameters.rightDefault;
    const right = !caseSensitive && typeof rawRight === "string" ? rawRight.toLowerCase() : rawRight;
    const result = compareValues(left, right, String(context.parameters.operator ?? "equals"));
    return { status: "success", route: result ? "true" : "false", outputs: { result } };
  }
});
