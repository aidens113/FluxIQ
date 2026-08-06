import { precisionOptions } from "./shared.ts";
import { defineBuiltinNode, emptyResult, inputValue, numberValue } from "../shared/definition.ts";

export const roundNode = defineBuiltinNode({
  id: "builtin.math.round",
  label: "Round",
  description: "Round a numeric value to a configured precision.",
  class: "math",
  scope: "both",
  inputs: [{ id: "value", label: "Value", valueType: "number", required: true }],
  outputs: [{ id: "result", label: "Result", valueType: "number" }],
  parameters: [
    { id: "precision", label: "Decimal places to keep", description: "How many digits should remain after the decimal point.", valueType: "string", defaultValue: "0", options: precisionOptions },
    {
      id: "mode",
      label: "Rounding method",
      description: "Choose whether to round normally, always down, or always up.",
      valueType: "string",
      defaultValue: "nearest",
      options: [
        { label: "Nearest number", value: "nearest" },
        { label: "Always down", value: "floor" },
        { label: "Always up", value: "ceil" }
      ]
    }
  ],
  icon: "circle-dot",
  execute: (context) => {
    const precision = Math.max(0, Math.floor(numberValue(context.parameters.precision)));
    const multiplier = 10 ** precision;
    const value = numberValue(inputValue(context, "value")) * multiplier;
    const rounded = context.parameters.mode === "floor" ? Math.floor(value) : context.parameters.mode === "ceil" ? Math.ceil(value) : Math.round(value);
    return emptyResult({ result: rounded / multiplier });
  }
});
