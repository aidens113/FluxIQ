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
    { id: "collection", label: "Collection", valueType: "string", required: true, ui: { control: "reference", referenceType: "database-collection", placeholder: "collection" } },
    { id: "where", label: "Filters", valueType: "object", defaultValue: {} },
    { id: "limit", label: "Limit", valueType: "number", defaultValue: 100 },
    { id: "orderBy", label: "Order by", valueType: "string", defaultValue: "", ui: { control: "field", placeholder: "fieldName" } },
    {
      id: "orderDirection",
      label: "Order direction",
      valueType: "string",
      defaultValue: "asc",
      options: [
        { label: "Ascending", value: "asc" },
        { label: "Descending", value: "desc" }
      ]
    }
  ],
  icon: "database",
  execute: (context) => ({
    status: "success",
    route: "success",
    outputs: { records: [] },
    effects: [{ type: "database.query.requested", payload: { collection: collectionName(context.parameters.collection), where: context.parameters.where ?? {}, limit: context.parameters.limit ?? 100, orderBy: context.parameters.orderBy ?? "", orderDirection: context.parameters.orderDirection ?? "asc" } }]
  })
});
