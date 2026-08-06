import { collectionName } from "./shared.ts";
import { defineBuiltinNode } from "../shared/definition.ts";

export const databaseUpdateNode = defineBuiltinNode({
  id: "builtin.database.update",
  label: "Update Records",
  description: "Ask a host database adapter to update matching records.",
  class: "database",
  scope: "both",
  inputs: [{ id: "patch", label: "Fields to change", valueType: "object", required: true }],
  outputs: [{ id: "result", label: "Result", valueType: "object" }],
  parameters: [
    { id: "collection", label: "Data table", description: "The saved record set/table containing records to update.", valueType: "string", required: true, ui: { control: "reference", referenceType: "database-collection", placeholder: "Choose a data table" } },
    { id: "where", label: "Only update records where", description: "Filter fields and values used to choose records. Be careful leaving this empty.", valueType: "object", defaultValue: {} },
    { id: "limit", label: "Maximum records to update", description: "Safety limit for how many records this request may change.", valueType: "number", defaultValue: 1 },
    { id: "dryRun", label: "Preview only", description: "When enabled, request a preview without actually changing records.", valueType: "boolean", defaultValue: false },
    { id: "returnUpdated", label: "Return updated records", description: "Send updated records to the next node.", valueType: "boolean", defaultValue: true }
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
