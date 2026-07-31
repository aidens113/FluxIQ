import { precisionOptions } from "./shared";
import { defineBuiltinNode, emptyResult, inputValue, numberValue } from "../shared/definition";

export const roundNode = defineBuiltinNode({
  id: "builtin.math.round",
  label: "Round",
  description: "Round a numeric value to a configured precision.",
  class: "math",
  scope: "both",
  inputs: [{ id: "value", label: "Value", valueType: "number", required: true }],
  outputs: [{ id: "result", label: "Result", valueType: "number" }],
  parameters: [
    { id: "precision", label: "Decimal places", valueType: "string", defaultValue: "0", options: precisionOptions },
    {
      id: "mode",
      label: "Mode",
      valueType: "string",
      defaultValue: "nearest",
      options: [
        { label: "Nearest", value: "nearest" },
        { label: "Floor", value: "floor" },
        { label: "Ceiling", value: "ceil" }
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
