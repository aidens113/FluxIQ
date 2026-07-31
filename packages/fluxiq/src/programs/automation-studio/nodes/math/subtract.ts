import { applyPrecision, binaryNumbers, optionalPrecisionOptions } from "./shared";
import { defineBuiltinNode, emptyResult } from "../shared/definition";

export const subtractNode = defineBuiltinNode({
  id: "builtin.math.subtract",
  label: "Subtract",
  description: "Subtract one numeric value from another.",
  class: "math",
  scope: "both",
  inputs: [
    { id: "left", label: "Left", valueType: "number", required: true },
    { id: "right", label: "Right", valueType: "number", required: true }
  ],
  outputs: [{ id: "result", label: "Result", valueType: "number" }],
  parameters: [{ id: "precision", label: "Round result to", description: "Optional rounding applied after subtraction.", valueType: "string", defaultValue: "none", options: optionalPrecisionOptions }],
  icon: "calculator",
  execute: (context) => {
    const [left, right] = binaryNumbers(context);
    return emptyResult({ result: applyPrecision(left - right, context.parameters.precision) });
  }
});
