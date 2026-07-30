import { randomInRange } from "./shared";
import { defineBuiltinNode, emptyResult } from "../shared/definition";

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
    { id: "max", label: "Maximum", valueType: "number", defaultValue: 1 }
  ],
  icon: "dice-5",
  execute: (context) => emptyResult({ value: randomInRange(context) })
});
