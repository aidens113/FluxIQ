import { randomInRange } from "./shared.ts";
import { precisionOptions } from "../math/shared.ts";
import { defineBuiltinNode, emptyResult, numberValue } from "../shared/definition.ts";

export const randomNumberNode = defineBuiltinNode({
  id: "builtin.random.number",
  label: "Random Number",
  description: "Produce a random number in a configured range.",
  class: "random",
  scope: "both",
  inputs: [],
  outputs: [{ id: "value", label: "Value", valueType: "number" }],
  parameters: [
    { id: "min", label: "Lowest possible number", description: "Start of the random range.", valueType: "number", defaultValue: 0 },
    { id: "max", label: "Highest possible number", description: "End of the random range.", valueType: "number", defaultValue: 1 },
    {
      id: "mode",
      label: "Number type",
      description: "Choose whether to produce a decimal number or a whole number.",
      valueType: "string",
      defaultValue: "float",
      options: [
        { label: "Decimal number", value: "float" },
        { label: "Whole number", value: "integer" }
      ]
    },
    { id: "precision", label: "Decimal places to keep", description: "Only used for decimal numbers.", valueType: "string", defaultValue: "2", options: precisionOptions },
    { id: "includeMax", label: "Include highest number", description: "Allow the random result to equal the highest possible number.", valueType: "boolean", defaultValue: false }
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
