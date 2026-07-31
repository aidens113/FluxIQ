import { randomInRange } from "./shared";
import { precisionOptions } from "../math/shared";
import { defineBuiltinNode, emptyResult, numberValue } from "../shared/definition";

export const randomNumberNode = defineBuiltinNode({
  id: "builtin.random.number",
  label: "Random Number",
  description: "Produce a random number in a configured range.",
  class: "random",
  scope: "both",
  inputs: [],
  outputs: [{ id: "value", label: "Value", valueType: "number" }],
  parameters: [
    { id: "min", label: "Minimum", valueType: "number", defaultValue: 0 },
    { id: "max", label: "Maximum", valueType: "number", defaultValue: 1 },
    {
      id: "mode",
      label: "Mode",
      valueType: "string",
      defaultValue: "float",
      options: [
        { label: "Float", value: "float" },
        { label: "Integer", value: "integer" }
      ]
    },
    { id: "precision", label: "Decimal places", valueType: "string", defaultValue: "2", options: precisionOptions },
    { id: "includeMax", label: "Allow maximum", valueType: "boolean", defaultValue: false }
  ],
  icon: "dice-5",
  execute: (context) => {
    const value = randomInRange(context);
    if (context.parameters.mode === "integer") {
      const min = Math.ceil(numberValue(context.parameters.min));
      const max = Math.floor(numberValue(context.parameters.max, 1));
      const upper = context.parameters.includeMax === true ? max + 1 : max;
      return emptyResult({ value: Math.floor(min + (context.random ? context.random() : Math.random()) * Math.max(1, upper - min)) });
    }
    const precision = Math.max(0, Math.min(12, Math.floor(numberValue(context.parameters.precision, 2))));
    const multiplier = 10 ** precision;
    return emptyResult({ value: Math.round(value * multiplier) / multiplier });
  }
});
