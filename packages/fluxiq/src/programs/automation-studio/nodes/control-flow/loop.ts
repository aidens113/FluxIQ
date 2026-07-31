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
  parameters: [
    { id: "maxIterations", label: "Max iterations", valueType: "number", defaultValue: 25 },
    { id: "startIndex", label: "Start index", valueType: "number", defaultValue: 0 },
    { id: "increment", label: "Increment", valueType: "number", defaultValue: 1 },
    { id: "bodyRoute", label: "Repeat route", valueType: "string", defaultValue: "body", options: [{ label: "Repeat", value: "body" }, { label: "Done", value: "done" }] },
    { id: "doneRoute", label: "Done route", valueType: "string", defaultValue: "done", options: [{ label: "Done", value: "done" }, { label: "Repeat", value: "body" }] }
  ],
  icon: "repeat",
  execute: (context) => ({ status: "success", route: routeFromCondition(context, String(context.parameters.bodyRoute ?? "body"), String(context.parameters.doneRoute ?? "done")), outputs: { maxIterations: maxIterations(context), startIndex: context.parameters.startIndex ?? 0, increment: context.parameters.increment ?? 1 } })
});
