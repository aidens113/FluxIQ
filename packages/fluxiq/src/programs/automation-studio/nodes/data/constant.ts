import { defineBuiltinNode, emptyResult } from "../shared/definition";

export const constantNode = defineBuiltinNode({
  id: "builtin.data.constant",
  label: "Constant",
  description: "Provide a fixed value to the graph.",
  class: "data",
  scope: "both",
  inputs: [],
  outputs: [{ id: "value", label: "Value", valueType: "any" }],
  parameters: [
    { id: "value", label: "Value", valueType: "any", defaultValue: null, ui: { control: "value" } },
    {
      id: "valueLabel",
      label: "Value label",
      valueType: "string",
      defaultValue: "Constant",
      ui: { control: "text", placeholder: "Value label" }
    }
  ],
  icon: "braces",
  execute: (context) => emptyResult({ value: context.parameters.value ?? null })
});
