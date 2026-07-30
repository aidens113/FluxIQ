import { routeFromCondition } from "./shared";
import { defineBuiltinNode } from "../shared/definition";

export const branchNode = defineBuiltinNode({
  id: "builtin.control.branch",
  label: "Branch",
  description: "Route execution through yes/no paths.",
  class: "control-flow",
  scope: "both",
  inputs: [{ id: "condition", label: "Condition", valueType: "boolean", required: true }],
  outputs: [
    { id: "true", label: "True", valueType: "any" },
    { id: "false", label: "False", valueType: "any" }
  ],
  parameters: [],
  icon: "git-branch",
  execute: (context) => ({ status: "success", route: routeFromCondition(context), outputs: {} })
});
