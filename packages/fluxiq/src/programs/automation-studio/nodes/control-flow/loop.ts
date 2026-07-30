import { maxIterations, routeFromCondition } from "./shared";
import { defineBuiltinNode } from "../shared/definition";

export const loopNode = defineBuiltinNode({
  id: "builtin.control.loop",
  label: "Loop",
  description: "Repeat a branch while a condition allows it.",
  class: "control-flow",
  scope: "routine",
  inputs: [{ id: "condition", label: "Condition", valueType: "boolean", required: true }],
  outputs: [
    { id: "body", label: "Repeat", valueType: "any" },
    { id: "done", label: "Done", valueType: "any" }
  ],
  parameters: [{ id: "maxIterations", label: "Max iterations", valueType: "number", defaultValue: 25 }],
  icon: "repeat",
  execute: (context) => ({ status: "success", route: routeFromCondition(context, "body", "done"), outputs: { maxIterations: maxIterations(context) } })
});
