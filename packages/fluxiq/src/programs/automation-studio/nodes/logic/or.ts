import { someBoolean } from "./shared";
import { defineBuiltinNode, emptyResult, arrayValue } from "../shared/definition";

export const orNode = defineBuiltinNode({
  id: "builtin.logic.or",
  label: "Or",
  description: "Return true when any input condition is true.",
  class: "logic",
  scope: "both",
  inputs: [{ id: "conditions", label: "Conditions", valueType: "boolean", required: true, multiple: true }],
  outputs: [{ id: "result", label: "Result", valueType: "boolean" }],
  parameters: [],
  icon: "list-tree",
  execute: (context) => emptyResult({ result: someBoolean(arrayValue(context.inputs.conditions)) })
});
