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
  parameters: [
    { id: "invert", label: "Invert condition", valueType: "boolean", defaultValue: false }
  ],
  icon: "git-branch",
  execute: (context) => {
    const route = routeFromCondition(context, "true", "false");
    const finalRoute = context.parameters.invert === true ? route === "true" ? "false" : "true" : route;
    return { status: "success", route: String(finalRoute), outputs: {} };
  }
});
