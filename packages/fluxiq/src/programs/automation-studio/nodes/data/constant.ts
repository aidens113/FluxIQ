import { defineBuiltinNode, emptyResult } from "../shared/definition.ts";

export const constantNode = defineBuiltinNode({
  id: "builtin.data.constant",
  label: "Constant",
  description: "Provide a fixed value to the graph.",
  class: "data",
  scope: "both",
  inputs: [],
  outputs: [{ id: "value", label: "Value", valueType: "any" }],
  parameters: [
    { id: "value", label: "Value to send", description: "The fixed value this node outputs every time it runs.", valueType: "any", defaultValue: null, ui: { control: "value" } },
    {
      id: "valueLabel",
      label: "Display name",
      description: "Friendly label shown on the node for this constant.",
      valueType: "string",
      defaultValue: "Constant",
      ui: { control: "text", placeholder: "Display name" }
    }
  ],
  icon: "braces",
  execute: (context) => emptyResult({ value: context.parameters.value ?? null })
});
