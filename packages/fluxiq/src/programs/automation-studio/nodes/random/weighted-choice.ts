import { randomFloat } from "./shared";
import { arrayValue, defineBuiltinNode, emptyResult, numberValue } from "../shared/definition";

type WeightedChoice = { value?: unknown; weight?: unknown };

export const weightedChoiceNode = defineBuiltinNode({
  id: "builtin.random.weighted-choice",
  label: "Weighted Choice",
  description: "Select one value from weighted options.",
  class: "random",
  scope: "both",
  inputs: [{ id: "choices", label: "Weighted choices", valueType: "array", required: true }],
  outputs: [{ id: "choice", label: "Choice", valueType: "any" }],
  parameters: [],
  icon: "scale",
  execute: (context) => {
    const choices = arrayValue(context.inputs.choices) as WeightedChoice[];
    const total = choices.reduce((sum, choice) => sum + Math.max(0, numberValue(choice.weight, 1)), 0);
    let cursor = randomFloat(context) * total;
    for (const choice of choices) {
      cursor -= Math.max(0, numberValue(choice.weight, 1));
      if (cursor <= 0) return emptyResult({ choice: choice.value ?? null });
    }
    return emptyResult({ choice: choices[0]?.value ?? null });
  }
});
