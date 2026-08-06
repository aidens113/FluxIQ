import { defineBuiltinNode, emptyResult } from "../shared/definition.ts";

export const mergeNode = defineBuiltinNode({
  id: "builtin.control.merge",
  label: "Merge",
  description: "Join several branches back into one path.",
  class: "control-flow",
  scope: "routine",
  inputs: [{ id: "branches", label: "Branches", valueType: "any", multiple: true }],
  outputs: [{ id: "next", label: "Next", valueType: "any" }],
  parameters: [
    {
      id: "mergeMode",
      label: "When to continue",
      description: "Choose whether this node continues after the first branch finishes, after all branches finish, or only with successful branch results.",
      valueType: "string",
      defaultValue: "first",
      options: [
        { label: "As soon as one branch finishes", value: "first" },
        { label: "After every branch finishes", value: "all" },
        { label: "After successful branches only", value: "successful" }
      ]
    }
  ],
  icon: "merge",
  execute: (context) => emptyResult({ next: context.inputs.branches ?? null, mergeMode: context.parameters.mergeMode ?? "first" })
});
