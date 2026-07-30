import { everyBoolean } from "./shared";
import { defineBuiltinNode, emptyResult, arrayValue } from "../shared/definition";

export const andNode = defineBuiltinNode({
  id: "builtin.logic.and",
  label: "And",
  description: "Return true when all input conditions are true.",
  class: "logic",
  scope: "both",
  inputs: [{ id: "conditions", label: "Conditions", valueType: "boolean", required: true, multiple: true }],
  outputs: [{ id: "result", label: "Result", valueType: "boolean" }],
  parameters: [],
  icon: "ampersand",
  execute: (context) => emptyResult({ result: everyBoolean(arrayValue(context.inputs.conditions)) })
});
