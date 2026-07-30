import { arrayValue, defineBuiltinNode, emptyResult } from "../shared/definition";

export const filterListNode = defineBuiltinNode({
  id: "builtin.data.filter-list",
  label: "Filter List",
  description: "Filter an array using a boolean expression.",
  class: "data",
  scope: "both",
  inputs: [{ id: "items", label: "Items", valueType: "array", required: true }],
  outputs: [{ id: "items", label: "Items", valueType: "array" }],
  parameters: [{ id: "predicate", label: "Predicate", valueType: "expression", required: true }],
  icon: "list-filter",
  execute: (context) => emptyResult({ items: arrayValue(context.inputs.items) })
});
