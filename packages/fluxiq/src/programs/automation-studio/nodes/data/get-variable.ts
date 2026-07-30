import { readVariable, variableName } from "./shared";
import { defineBuiltinNode, emptyResult } from "../shared/definition";

export const getVariableNode = defineBuiltinNode({
  id: "builtin.data.get-variable",
  label: "Get Variable",
  description: "Read a named runtime variable.",
  class: "data",
  scope: "both",
  inputs: [],
  outputs: [{ id: "value", label: "Value", valueType: "any" }],
  parameters: [{ id: "name", label: "Name", valueType: "string", required: true }],
  icon: "database",
  execute: (context) => emptyResult({ value: readVariable(context.variables, variableName(context.parameters.name)) })
});
