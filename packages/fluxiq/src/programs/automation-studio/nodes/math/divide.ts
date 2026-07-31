import { applyPrecision, binaryNumbers, optionalPrecisionOptions } from "./shared";
import { defineBuiltinNode, emptyResult, numberValue } from "../shared/definition";

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
    { id: "precision", label: "Decimal places", valueType: "string", defaultValue: "none", options: optionalPrecisionOptions },
    {
      id: "divideByZero",
      label: "Divide by zero",
      valueType: "string",
      defaultValue: "fail",
      options: [
        { label: "Fail", value: "fail" },
        { label: "Return fallback", value: "fallback" },
        { label: "Return null", value: "null" }
      ]
    },
    { id: "fallback", label: "Fallback", valueType: "number", defaultValue: 0 }
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
