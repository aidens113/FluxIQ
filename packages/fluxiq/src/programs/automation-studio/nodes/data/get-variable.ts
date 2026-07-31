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
  parameters: [
    { id: "name", label: "Name", valueType: "string", required: true },
    { id: "defaultValue", label: "Default value", valueType: "any", defaultValue: null },
    { id: "required", label: "Required", valueType: "boolean", defaultValue: false }
  ],
  icon: "database",
  execute: (context) => {
    const name = variableName(context.parameters.name);
    const value = readVariable(context.variables, name);
    if (value === null && context.parameters.required === true) return { status: "failed", route: "missing", outputs: { value: context.parameters.defaultValue ?? null } };
    return emptyResult({ value: value ?? context.parameters.defaultValue ?? null });
  }
});
