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
  parameters: [
    { id: "fallback", label: "Fallback", valueType: "any", defaultValue: null, ui: { control: "value" } },
    { id: "allowEmpty", label: "Allow empty list", valueType: "boolean", defaultValue: true }
  ],
  icon: "shuffle",
  execute: (context) => {
    const choices = arrayValue(context.inputs.choices);
    if (!choices.length) {
      if (context.parameters.allowEmpty === false) return { status: "failed", route: "failed", outputs: { choice: context.parameters.fallback ?? null } };
      return emptyResult({ choice: context.parameters.fallback ?? null });
    }
    return emptyResult({ choice: choices[Math.floor(randomFloat(context) * choices.length)] ?? context.parameters.fallback ?? null });
  }
});
