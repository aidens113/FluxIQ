import { defineBuiltinNode, emptyResult } from "../shared/definition";

export const parallelNode = defineBuiltinNode({
  id: "builtin.control.parallel",
  label: "Parallel",
  description: "Fan out into parallel branches.",
  class: "control-flow",
  scope: "routine",
  inputs: [{ id: "in", label: "In", valueType: "any" }],
  outputs: [{ id: "branches", label: "Branches", valueType: "any", multiple: true }],
  parameters: [],
  icon: "workflow",
  execute: (context) => emptyResult({ branches: context.inputs.in ?? null })
});
