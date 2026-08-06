import { collectionName } from "./shared.ts";
import { defineBuiltinNode } from "../shared/definition.ts";

export const databaseQueryNode = defineBuiltinNode({
  id: "builtin.database.query",
  label: "Find Records",
  description: "Ask a host database adapter to find records in a data table.",
  class: "database",
  scope: "both",
  inputs: [],
  outputs: [{ id: "records", label: "Records", valueType: "array" }],
  parameters: [
    { id: "collection", label: "Data table", description: "The saved record set/table to search.", valueType: "string", required: true, ui: { control: "reference", referenceType: "database-collection", placeholder: "Choose a data table" } },
    { id: "where", label: "Only include records where", description: "Filter fields and values. Leave empty to include all records.", valueType: "object", defaultValue: {} },
    { id: "limit", label: "Maximum records", description: "Largest number of records to return.", valueType: "number", defaultValue: 100 },
    { id: "orderBy", label: "Sort by field", description: "Optional field used to sort the returned records.", valueType: "string", defaultValue: "", ui: { control: "field", placeholder: "fieldName" } },
    {
      id: "orderDirection",
      label: "Sort direction",
      description: "Choose whether lower values or higher values appear first.",
      valueType: "string",
      defaultValue: "asc",
      options: [
        { label: "Lowest first", value: "asc" },
        { label: "Highest first", value: "desc" }
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
