import { collectionName } from "./shared";
import { defineBuiltinNode } from "../shared/definition";

export const databaseUpdateNode = defineBuiltinNode({
  id: "builtin.database.update",
  label: "Update",
  description: "Request updates for records in a host database collection.",
  class: "database",
  scope: "both",
  inputs: [{ id: "patch", label: "Patch", valueType: "object", required: true }],
  outputs: [{ id: "result", label: "Result", valueType: "object" }],
  parameters: [
    { id: "collection", label: "Collection", valueType: "string", required: true },
    { id: "where", label: "Where", valueType: "json", defaultValue: {} }
  ],
  icon: "database",
  privileged: true,
  execute: (context) => ({
    status: "success",
    route: "result",
    outputs: { result: {} },
    effects: [{ type: "database.update.requested", payload: { collection: collectionName(context.parameters.collection), where: context.parameters.where ?? {}, patch: context.inputs.patch ?? {} } }]
  })
});
