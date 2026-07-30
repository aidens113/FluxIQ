import { collectionName } from "./shared";
import { defineBuiltinNode } from "../shared/definition";

export const databaseQueryNode = defineBuiltinNode({
  id: "builtin.database.query",
  label: "Query",
  description: "Request records from a configured host database collection.",
  class: "database",
  scope: "both",
  inputs: [],
  outputs: [{ id: "records", label: "Records", valueType: "array" }],
  parameters: [
    { id: "collection", label: "Collection", valueType: "string", required: true },
    { id: "where", label: "Where", valueType: "json", defaultValue: {} }
  ],
  icon: "database",
  execute: (context) => ({
    status: "success",
    route: "records",
    outputs: { records: [] },
    effects: [{ type: "database.query.requested", payload: { collection: collectionName(context.parameters.collection), where: context.parameters.where ?? {} } }]
  })
});
