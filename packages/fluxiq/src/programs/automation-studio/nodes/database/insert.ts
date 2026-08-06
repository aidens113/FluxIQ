import { collectionName } from "./shared.ts";
import { defineBuiltinNode } from "../shared/definition.ts";

export const databaseInsertNode = defineBuiltinNode({
  id: "builtin.database.insert",
  label: "Create Record",
  description: "Ask a host database adapter to create one record.",
  class: "database",
  scope: "both",
  inputs: [{ id: "record", label: "Record", valueType: "object", required: true }],
  outputs: [{ id: "record", label: "Record", valueType: "object" }],
  parameters: [
    { id: "collection", label: "Data table", description: "The saved record set/table where the new record should be created.", valueType: "string", required: true, ui: { control: "reference", referenceType: "database-collection", placeholder: "Choose a data table" } },
    { id: "upsert", label: "Update matching record instead", description: "If a matching record already exists, update it instead of creating a duplicate.", valueType: "boolean", defaultValue: false },
    { id: "conflictKey", label: "Match on field", description: "Field used to find an existing record when update-matching is enabled.", valueType: "string", defaultValue: "", ui: { control: "field", placeholder: "uniqueField" } },
    { id: "returnRecord", label: "Return created record", description: "Send the created or updated record to the next node.", valueType: "boolean", defaultValue: true }
  ],
  icon: "file-input",
  privileged: true,
  execute: (context) => ({
    status: "success",
    route: "success",
    outputs: { record: context.inputs.record ?? {} },
    effects: [{ type: "database.insert.requested", payload: { collection: collectionName(context.parameters.collection), record: context.inputs.record ?? {}, upsert: context.parameters.upsert === true, conflictKey: context.parameters.conflictKey ?? "", returnRecord: context.parameters.returnRecord !== false } }]
  })
});
