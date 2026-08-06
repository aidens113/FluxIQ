import { variableName, writeVariable } from "./shared.ts";
import { defineBuiltinNode, emptyResult, jsonValue } from "../shared/definition.ts";

export const setVariableNode = defineBuiltinNode({
  id: "builtin.data.set-variable",
  label: "Set Variable",
  description: "Write a named runtime variable.",
  class: "data",
  scope: "both",
  inputs: [{ id: "value", label: "Value", valueType: "any", required: true }],
  outputs: [{ id: "next", label: "Next", valueType: "any" }],
  parameters: [
    { id: "name", label: "Variable name", description: "The saved workflow value to create or update.", valueType: "string", required: true, ui: { control: "reference", referenceType: "variable", placeholder: "variableName" } },
    {
      id: "writeMode",
      label: "How to save the value",
      description: "Choose whether to replace the old value, merge object fields, or append to a list.",
      valueType: "string",
      defaultValue: "replace",
      options: [
        { label: "Replace existing value", value: "replace" },
        { label: "Merge into object", value: "merge-object" },
        { label: "Add to list", value: "append-list" }
      ]
    }
  ],
  icon: "save",
  execute: (context) => {
    const name = variableName(context.parameters.name);
    const current = context.variables?.get(name);
    const incoming = jsonValue(context.inputs.value);
    let value = incoming;
    if (context.parameters.writeMode === "merge-object") value = { ...(typeof current === "object" && current && !Array.isArray(current) ? current : {}), ...(typeof incoming === "object" && incoming && !Array.isArray(incoming) ? incoming : {}) };
    if (context.parameters.writeMode === "append-list") value = [...(Array.isArray(current) ? current : []), incoming];
    writeVariable(context.variables, name, value);
    return emptyResult({ next: value });
  }
});
