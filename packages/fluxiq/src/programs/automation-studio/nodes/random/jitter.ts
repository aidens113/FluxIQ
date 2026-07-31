import { randomFloat } from "./shared";
import { optionalPrecisionOptions } from "../math/shared";
import { defineBuiltinNode, emptyResult, inputValue, numberValue } from "../shared/definition";

export const jitterNode = defineBuiltinNode({
  id: "builtin.random.jitter",
  label: "Jitter",
  description: "Add bounded randomness to a numeric value.",
  class: "random",
  scope: "both",
  inputs: [{ id: "value", label: "Value", valueType: "number", required: true }],
  outputs: [{ id: "value", label: "Value", valueType: "number" }],
  parameters: [
    { id: "amount", label: "Amount", valueType: "number", defaultValue: 0.1 },
    { id: "precision", label: "Decimal places", valueType: "string", defaultValue: "none", options: optionalPrecisionOptions },
    { id: "min", label: "Minimum clamp", valueType: "number", defaultValue: -999999 },
    { id: "max", label: "Maximum clamp", valueType: "number", defaultValue: 999999 }
  ],
  icon: "waves",
  execute: (context) => {
    const amount = Math.max(0, numberValue(context.parameters.amount, 0.1));
    const offset = (randomFloat(context) * 2 - 1) * amount;
    const min = numberValue(context.parameters.min, -999999);
    const max = numberValue(context.parameters.max, 999999);
    const precision = Math.floor(numberValue(context.parameters.precision, -1));
    const raw = Math.min(Math.max(numberValue(inputValue(context, "value")) + offset, Math.min(min, max)), Math.max(min, max));
    if (precision >= 0) {
      const multiplier = 10 ** Math.min(12, precision);
      return emptyResult({ value: Math.round(raw * multiplier) / multiplier });
    }
    return emptyResult({ value: raw });
  }
});
