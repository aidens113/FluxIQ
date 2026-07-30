import { randomFloat } from "./shared";
import { defineBuiltinNode, emptyResult, inputValue, numberValue } from "../shared/definition";

export const jitterNode = defineBuiltinNode({
  id: "builtin.random.jitter",
  label: "Jitter",
  description: "Add bounded randomness to a numeric value.",
  class: "random",
  scope: "both",
  inputs: [{ id: "value", label: "Value", valueType: "number", required: true }],
  outputs: [{ id: "value", label: "Value", valueType: "number" }],
  parameters: [{ id: "amount", label: "Amount", valueType: "number", defaultValue: 0.1 }],
  icon: "waves",
  execute: (context) => {
    const amount = numberValue(context.parameters.amount, 0.1);
    const offset = (randomFloat(context) * 2 - 1) * amount;
    return emptyResult({ value: numberValue(inputValue(context, "value")) + offset });
  }
});
