import { variableName, writeVariable } from "./shared";
import { defineBuiltinNode, emptyResult } from "../shared/definition";

export const setVariableNode = defineBuiltinNode({
  id: "builtin.data.set-variable",
  label: "Set Variable",
  description: "Write a named runtime variable.",
  class: "data",
  scope: "both",
  inputs: [{ id: "value", label: "Value", valueType: "any", required: true }],
  outputs: [{ id: "next", label: "Next", valueType: "any" }],
  parameters: [{ id: "name", label: "Name", valueType: "string", required: true }],
  icon: "save",
  execute: (context) => {
    writeVariable(context.variables, variableName(context.parameters.name), context.inputs.value ?? null);
    return emptyResult({ next: context.inputs.value ?? null });
  }
});
