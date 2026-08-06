import { maxIterations, routeFromCondition } from "./shared.ts";
import { defineBuiltinNode } from "../shared/definition.ts";

export const loopNode = defineBuiltinNode({
  id: "builtin.control.loop",
  label: "Loop",
  description: "Repeat a section while a condition is still true.",
  class: "control-flow",
  scope: "routine",
  inputs: [{ id: "condition", label: "Condition", valueType: "boolean", required: true }],
  outputs: [
    { id: "body", label: "Repeat", valueType: "any" },
    { id: "done", label: "Done", valueType: "any" }
  ],
  parameters: [
    { id: "maxIterations", label: "Maximum repeats", description: "Safety limit for how many times this loop may run.", valueType: "number", defaultValue: 25 },
    { id: "startIndex", label: "Starting count", description: "The first count value exposed to the loop body.", valueType: "number", defaultValue: 0 },
    { id: "increment", label: "Count by", description: "How much the loop count changes after each repeat.", valueType: "number", defaultValue: 1 }
  ],
  icon: "repeat",
  execute: (context) => ({ status: "success", route: routeFromCondition(context, "body", "done"), outputs: { maxIterations: maxIterations(context), startIndex: context.parameters.startIndex ?? 0, increment: context.parameters.increment ?? 1 } })
});
