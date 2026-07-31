import { arrayValue, compareBasic, defineBuiltinNode, emptyResult, getPathValue } from "../shared/definition";

export const filterListNode = defineBuiltinNode({
  id: "builtin.data.filter-list",
  label: "Filter List",
  description: "Filter an array using a boolean expression.",
  class: "data",
  scope: "both",
  inputs: [{ id: "items", label: "Items", valueType: "array", required: true }],
  outputs: [{ id: "items", label: "Items", valueType: "array" }],
  parameters: [
    { id: "path", label: "Item path", valueType: "string", defaultValue: "" },
    {
      id: "operator",
      label: "Operator",
      valueType: "string",
      defaultValue: "exists",
      options: ["exists", "equals", "not-equals", "greater-than", "less-than", "contains"].map((value) => ({ label: value, value }))
    },
    { id: "value", label: "Compare value", valueType: "any", defaultValue: null },
    {
      id: "onInvalid",
      label: "Invalid items",
      valueType: "string",
      defaultValue: "exclude",
      options: [
        { label: "Exclude", value: "exclude" },
        { label: "Include", value: "include" }
      ]
    }
  ],
  icon: "list-filter",
  execute: (context) => {
    const items = arrayValue(context.inputs.items);
    const path = context.parameters.path;
    const filtered = items.filter((item) => {
      const left = path ? getPathValue(item, path) : item;
      const result = compareBasic(left, context.parameters.value, context.parameters.operator);
      return result || (left === undefined && context.parameters.onInvalid === "include");
    });
    return emptyResult({ items: filtered });
  }
});
