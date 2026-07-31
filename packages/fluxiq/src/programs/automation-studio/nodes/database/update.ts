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
    { id: "collection", label: "Collection", valueType: "string", required: true, ui: { control: "reference", referenceType: "database-collection", placeholder: "collection" } },
    { id: "where", label: "Filters", valueType: "object", defaultValue: {} },
    { id: "limit", label: "Limit", valueType: "number", defaultValue: 1 },
    { id: "dryRun", label: "Dry run", valueType: "boolean", defaultValue: false },
    { id: "returnUpdated", label: "Return updated records", valueType: "boolean", defaultValue: true }
  ],
  icon: "database",
  privileged: true,
  execute: (context) => ({
    status: "success",
    route: "success",
    outputs: { result: {} },
    effects: [{ type: "database.update.requested", payload: { collection: collectionName(context.parameters.collection), where: context.parameters.where ?? {}, patch: context.inputs.patch ?? {}, limit: context.parameters.limit ?? 1, dryRun: context.parameters.dryRun === true, returnUpdated: context.parameters.returnUpdated !== false } }]
  })
});
