import { defineBuiltinNode, emptyResult } from "../shared/definition";

export const mapObjectNode = defineBuiltinNode({
  id: "builtin.data.map-object",
  label: "Map Object",
  description: "Transform object fields through an expression map.",
  class: "data",
  scope: "both",
  inputs: [{ id: "object", label: "Object", valueType: "object", required: true }],
  outputs: [{ id: "object", label: "Object", valueType: "object" }],
  parameters: [{ id: "mapping", label: "Mapping", valueType: "json", defaultValue: {} }],
  icon: "file-json",
  execute: (context) => {
    const source = typeof context.inputs.object === "object" && context.inputs.object !== null && !Array.isArray(context.inputs.object) ? context.inputs.object : {};
    const mapping = typeof context.parameters.mapping === "object" && context.parameters.mapping !== null && !Array.isArray(context.parameters.mapping) ? context.parameters.mapping : {};
    return emptyResult({ object: { ...source, ...mapping } });
  }
});
