import { defineBuiltinNode } from "../shared/definition";

export const endNode = defineBuiltinNode({
  id: "builtin.control.end",
  label: "End",
  description: "Terminal point for a policy or routine graph.",
  class: "control-flow",
  scope: "both",
  inputs: [{ id: "in", label: "In", valueType: "any" }],
  outputs: [],
  parameters: [],
  icon: "circle-stop",
  execute: () => ({ status: "success", route: "end", outputs: {} })
});
