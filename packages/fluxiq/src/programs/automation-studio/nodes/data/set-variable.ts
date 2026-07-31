import { variableName, writeVariable } from "./shared";
import { defineBuiltinNode, emptyResult, jsonValue } from "../shared/definition";

export const setVariableNode = defineBuiltinNode({
  id: "builtin.data.set-variable",
  label: "Set Variable",
  description: "Write a named runtime variable.",
  class: "data",
  scope: "both",
  inputs: [{ id: "value", label: "Value", valueType: "any", required: true }],
  outputs: [{ id: "next", label: "Next", valueType: "any" }],
  parameters: [
    { id: "name", label: "Name", valueType: "string", required: true, ui: { control: "reference", referenceType: "variable", placeholder: "variableName" } },
    {
      id: "writeMode",
      label: "Write mode",
      valueType: "string",
      defaultValue: "replace",
      options: [
        { label: "Replace", value: "replace" },
        { label: "Merge object", value: "merge-object" },
        { label: "Append to list", value: "append-list" }
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
