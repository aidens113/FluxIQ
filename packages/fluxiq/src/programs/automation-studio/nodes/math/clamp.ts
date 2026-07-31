import { defineBuiltinNode, emptyResult, inputValue, numberValue } from "../shared/definition";

export const clampNode = defineBuiltinNode({
  id: "builtin.math.clamp",
  label: "Clamp",
  description: "Clamp a number between minimum and maximum bounds.",
  class: "math",
  scope: "both",
  inputs: [{ id: "value", label: "Value", valueType: "number", required: true }],
  outputs: [{ id: "result", label: "Result", valueType: "number" }],
  parameters: [
    { id: "min", label: "Lowest allowed value", description: "Numbers below this are raised to this value.", valueType: "number", defaultValue: 0 },
    { id: "max", label: "Highest allowed value", description: "Numbers above this are lowered to this value.", valueType: "number", defaultValue: 1 }
  ],
  icon: "between-horizontal-start",
  execute: (context) => {
    const value = numberValue(inputValue(context, "value"));
    const min = numberValue(context.parameters.min);
    const max = numberValue(context.parameters.max, 1);
    return emptyResult({ result: Math.min(Math.max(value, Math.min(min, max)), Math.max(min, max)) });
  }
});
