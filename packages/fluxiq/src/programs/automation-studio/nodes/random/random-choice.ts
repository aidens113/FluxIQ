import { randomFloat } from "./shared";
import { arrayValue, defineBuiltinNode, emptyResult } from "../shared/definition";

export const randomChoiceNode = defineBuiltinNode({
  id: "builtin.random.choice",
  label: "Random Choice",
  description: "Select one value from a list.",
  class: "random",
  scope: "both",
  inputs: [{ id: "choices", label: "Choices", valueType: "array", required: true }],
  outputs: [{ id: "choice", label: "Choice", valueType: "any" }],
  parameters: [],
  icon: "shuffle",
  execute: (context) => {
    const choices = arrayValue(context.inputs.choices);
    return emptyResult({ choice: choices[Math.floor(randomFloat(context) * choices.length)] ?? null });
  }
});
