import { applyPrecision, binaryNumbers, optionalPrecisionOptions } from "./shared";
import { defineBuiltinNode, emptyResult, numberValue } from "../shared/definition";

export const addNode = defineBuiltinNode({
  id: "builtin.math.add",
  label: "Add",
  description: "Add two numeric values.",
  class: "math",
  scope: "both",
  inputs: [
    { id: "left", label: "Left", valueType: "number", required: true },
    { id: "right", label: "Right", valueType: "number", required: true }
  ],
  outputs: [{ id: "result", label: "Result", valueType: "number" }],
  parameters: [
    { id: "offset", label: "Add after total", description: "Extra amount added after the two inputs are combined.", valueType: "number", defaultValue: 0 },
    { id: "precision", label: "Round result to", description: "Optional rounding applied after the calculation.", valueType: "string", defaultValue: "none", options: optionalPrecisionOptions }
  ],
  icon: "calculator",
  execute: (context) => {
    const [left, right] = binaryNumbers(context);
    return emptyResult({ result: applyPrecision(left + right + numberValue(context.parameters.offset), context.parameters.precision) });
  }
});
