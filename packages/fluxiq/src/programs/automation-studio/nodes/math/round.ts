import { defineBuiltinNode, emptyResult, inputValue, numberValue } from "../shared/definition";

export const roundNode = defineBuiltinNode({
  id: "builtin.math.round",
  label: "Round",
  description: "Round a numeric value to a configured precision.",
  class: "math",
  scope: "both",
  inputs: [{ id: "value", label: "Value", valueType: "number", required: true }],
  outputs: [{ id: "result", label: "Result", valueType: "number" }],
  parameters: [{ id: "precision", label: "Precision", valueType: "number", defaultValue: 0 }],
  icon: "circle-dot",
  execute: (context) => {
    const precision = Math.max(0, Math.floor(numberValue(context.parameters.precision)));
    const multiplier = 10 ** precision;
    return emptyResult({ result: Math.round(numberValue(inputValue(context, "value")) * multiplier) / multiplier });
  }
});
