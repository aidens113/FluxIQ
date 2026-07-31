import { collectionName } from "./shared";
import { defineBuiltinNode } from "../shared/definition";

export const databaseInsertNode = defineBuiltinNode({
  id: "builtin.database.insert",
  label: "Insert",
  description: "Request insertion of a record into a host database collection.",
  class: "database",
  scope: "both",
  inputs: [{ id: "record", label: "Record", valueType: "object", required: true }],
  outputs: [{ id: "record", label: "Record", valueType: "object" }],
  parameters: [
    { id: "collection", label: "Collection", valueType: "string", required: true },
    { id: "upsert", label: "Upsert", valueType: "boolean", defaultValue: false },
    { id: "conflictKey", label: "Conflict key", valueType: "string", defaultValue: "" },
    { id: "returnRecord", label: "Return record", valueType: "boolean", defaultValue: true }
  ],
  icon: "file-input",
  privileged: true,
  execute: (context) => ({
    status: "success",
    route: "record",
    outputs: { record: context.inputs.record ?? {} },
    effects: [{ type: "database.insert.requested", payload: { collection: collectionName(context.parameters.collection), record: context.inputs.record ?? {}, upsert: context.parameters.upsert === true, conflictKey: context.parameters.conflictKey ?? "", returnRecord: context.parameters.returnRecord !== false } }]
  })
});
