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
    { id: "trueRoute", label: "True route", valueType: "string", defaultValue: "true", options: [{ label: "True", value: "true" }, { label: "False", value: "false" }] },
    { id: "falseRoute", label: "False route", valueType: "string", defaultValue: "false", options: [{ label: "False", value: "false" }, { label: "True", value: "true" }] },
    { id: "invert", label: "Invert condition", valueType: "boolean", defaultValue: false }
  ],
  icon: "git-branch",
  execute: (context) => {
    const route = routeFromCondition(context, String(context.parameters.trueRoute ?? "true"), String(context.parameters.falseRoute ?? "false"));
    const finalRoute = context.parameters.invert === true ? route === context.parameters.trueRoute ? context.parameters.falseRoute : context.parameters.trueRoute : route;
    return { status: "success", route: String(finalRoute), outputs: {} };
  }
});
