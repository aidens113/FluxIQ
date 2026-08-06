import { defineBuiltinNode, emptyResult, getPathValue, objectValue, setPathValue } from "../shared/definition.ts";

export const mapObjectNode = defineBuiltinNode({
  id: "builtin.data.map-object",
  label: "Map Object",
  description: "Create or reshape fields on an object.",
  class: "data",
  scope: "both",
  inputs: [{ id: "object", label: "Object", valueType: "object", required: true }],
  outputs: [{ id: "object", label: "Object", valueType: "object" }],
  parameters: [
    { id: "mapping", label: "Field changes", description: "Fields to add, pick, or rename depending on the selected mode.", valueType: "object", defaultValue: {} },
    {
      id: "mode",
      label: "How to change the object",
      description: "Choose whether to add fields, keep selected fields, or copy values into new field paths.",
      valueType: "string",
      defaultValue: "merge",
      options: [
        { label: "Add or replace fields", value: "merge" },
        { label: "Keep only selected fields", value: "pick" },
        { label: "Copy fields to new names", value: "rename" }
      ]
    }
  ],
  icon: "file-json",
  execute: (context) => {
    const source = objectValue(context.inputs.object);
    const mapping = objectValue(context.parameters.mapping);
    if (context.parameters.mode === "pick") {
      return emptyResult({ object: Object.fromEntries(Object.entries(mapping).map(([target, path]) => [target, getPathValue(source, path)])) });
    }
    if (context.parameters.mode === "rename") {
      let next = { ...source };
      for (const [target, path] of Object.entries(mapping)) next = setPathValue(next, target, getPathValue(source, path));
      return emptyResult({ object: next });
    }
    return emptyResult({ object: { ...source, ...mapping } });
  }
});
