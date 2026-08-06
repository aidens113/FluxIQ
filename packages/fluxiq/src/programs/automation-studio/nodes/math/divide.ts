import { applyPrecision, binaryNumbers, optionalPrecisionOptions } from "./shared.ts";
import { defineBuiltinNode, emptyResult, numberValue } from "../shared/definition.ts";

export const divideNode = defineBuiltinNode({
  id: "builtin.math.divide",
  label: "Divide",
  description: "Divide one numeric value by another.",
  class: "math",
  scope: "both",
  inputs: [
    { id: "left", label: "Left", valueType: "number", required: true },
    { id: "right", label: "Right", valueType: "number", required: true }
  ],
  outputs: [{ id: "result", label: "Result", valueType: "number" }],
  parameters: [
    { id: "precision", label: "Round result to", description: "Optional rounding applied after division.", valueType: "string", defaultValue: "none", options: optionalPrecisionOptions },
    {
      id: "divideByZero",
      label: "If dividing by zero",
      description: "Choose what happens when the right input is zero.",
      valueType: "string",
      defaultValue: "fail",
      options: [
        { label: "Fail this path", value: "fail" },
        { label: "Use fallback value", value: "fallback" },
        { label: "Return empty value", value: "null" }
      ]
    },
    { id: "fallback", label: "Fallback value", description: "Number to return when dividing by zero and fallback is selected.", valueType: "number", defaultValue: 0 }
  ],
  icon: "calculator",
  execute: (context) => {
    const [left, right] = binaryNumbers(context);
    if (right === 0) {
      if (context.parameters.divideByZero === "fallback") return emptyResult({ result: numberValue(context.parameters.fallback) });
      if (context.parameters.divideByZero === "null") return emptyResult({ result: null });
      return { status: "failed", route: "failed", outputs: { result: null } };
    }
    return emptyResult({ result: applyPrecision(left / right, context.parameters.precision) });
  }
});
