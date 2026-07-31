import { defineBuiltinNode, emptyResult } from "../shared/definition";

export const mergeNode = defineBuiltinNode({
  id: "builtin.control.merge",
  label: "Merge",
  description: "Join multiple incoming branches into one path.",
  class: "control-flow",
  scope: "routine",
  inputs: [{ id: "branches", label: "Branches", valueType: "any", multiple: true }],
  outputs: [{ id: "next", label: "Next", valueType: "any" }],
  parameters: [
    {
      id: "mergeMode",
      label: "Merge mode",
      valueType: "string",
      defaultValue: "first",
      options: [
        { label: "First completed", value: "first" },
        { label: "All results", value: "all" },
        { label: "Successful only", value: "successful" }
      ]
    }
  ],
  icon: "merge",
  execute: (context) => emptyResult({ next: context.inputs.branches ?? null, mergeMode: context.parameters.mergeMode ?? "first" })
});
