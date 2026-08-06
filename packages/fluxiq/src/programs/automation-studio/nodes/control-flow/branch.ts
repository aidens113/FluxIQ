import { routeFromCondition } from "./shared.ts";
import { defineBuiltinNode } from "../shared/definition.ts";

export const branchNode = defineBuiltinNode({
  id: "builtin.control.branch",
  label: "Branch",
  description: "Choose one of two paths from a yes/no condition.",
  class: "control-flow",
  scope: "both",
  inputs: [{ id: "condition", label: "Condition", valueType: "boolean", required: true }],
  outputs: [
    { id: "true", label: "True", valueType: "any" },
    { id: "false", label: "False", valueType: "any" }
  ],
  parameters: [
    { id: "invert", label: "Swap Yes and No paths", description: "When enabled, true goes to No and false goes to Yes.", valueType: "boolean", defaultValue: false }
  ],
  icon: "git-branch",
  execute: (context) => {
    const route = routeFromCondition(context, "true", "false");
    const finalRoute = context.parameters.invert === true ? route === "true" ? "false" : "true" : route;
    return { status: "success", route: String(finalRoute), outputs: {} };
  }
});
