import { randomFloat } from "./shared.ts";
import { arrayValue, defineBuiltinNode, emptyResult, numberValue } from "../shared/definition.ts";

type WeightedChoice = { value?: unknown; weight?: unknown };

export const weightedChoiceNode = defineBuiltinNode({
  id: "builtin.random.weighted-choice",
  label: "Weighted Choice",
  description: "Select one value from weighted options.",
  class: "random",
  scope: "both",
  inputs: [{ id: "choices", label: "Weighted choices", valueType: "array", required: true }],
  outputs: [{ id: "choice", label: "Choice", valueType: "any" }],
  parameters: [
    { id: "defaultWeight", label: "Default chance weight", description: "Used for choices that do not provide their own weight.", valueType: "number", defaultValue: 1 },
    { id: "fallback", label: "If no choice can be picked", description: "Value to return when the list is empty or all weights are zero.", valueType: "any", defaultValue: null, ui: { control: "value" } },
    { id: "normalizeWeights", label: "Balance weights automatically", description: "Treat weights as relative chances instead of requiring them to add up to a specific total.", valueType: "boolean", defaultValue: true }
  ],
  icon: "scale",
  execute: (context) => {
    const choices = arrayValue(context.inputs.choices) as WeightedChoice[];
    const defaultWeight = numberValue(context.parameters.defaultWeight, 1);
    const total = choices.reduce((sum, choice) => sum + Math.max(0, numberValue(choice.weight, defaultWeight)), 0);
    if (!choices.length || total <= 0) return emptyResult({ choice: context.parameters.fallback ?? null });
    let cursor = randomFloat(context) * total;
    for (const choice of choices) {
      cursor -= Math.max(0, numberValue(choice.weight, defaultWeight));
      if (cursor <= 0) return emptyResult({ choice: choice.value ?? null });
    }
    return emptyResult({ choice: choices[0]?.value ?? context.parameters.fallback ?? null });
  }
});
