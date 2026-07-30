import { defineBuiltinNode, emptyResult } from "../shared/definition";

export const startNode = defineBuiltinNode({
  id: "builtin.control.start",
  label: "Start",
  description: "Entry point for a policy or routine graph.",
  class: "control-flow",
  scope: "both",
  inputs: [],
  outputs: [{ id: "next", label: "Next", valueType: "any" }],
  parameters: [],
  icon: "play",
  execute: () => emptyResult({ next: true })
});
