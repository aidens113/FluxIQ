import { defineBuiltinNode, emptyResult, getPathValue, objectValue, setPathValue } from "../shared/definition";

export const mapObjectNode = defineBuiltinNode({
  id: "builtin.data.map-object",
  label: "Map Object",
  description: "Transform object fields through an expression map.",
  class: "data",
  scope: "both",
  inputs: [{ id: "object", label: "Object", valueType: "object", required: true }],
  outputs: [{ id: "object", label: "Object", valueType: "object" }],
  parameters: [
    { id: "mapping", label: "Mapping", valueType: "object", defaultValue: {} },
    {
      id: "mode",
      label: "Mode",
      valueType: "string",
      defaultValue: "merge",
      options: [
        { label: "Merge fields", value: "merge" },
        { label: "Pick fields", value: "pick" },
        { label: "Rename paths", value: "rename" }
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
