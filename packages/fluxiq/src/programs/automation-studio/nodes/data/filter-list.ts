import { arrayValue, compareBasic, defineBuiltinNode, emptyResult, getPathValue } from "../shared/definition.ts";

export const filterListNode = defineBuiltinNode({
  id: "builtin.data.filter-list",
  label: "Filter List",
  description: "Keep only list items that match a simple rule.",
  class: "data",
  scope: "both",
  inputs: [{ id: "items", label: "Items", valueType: "array", required: true }],
  outputs: [{ id: "items", label: "Items", valueType: "array" }],
  parameters: [
    { id: "path", label: "Field to check", description: "Optional field inside each item, such as status or user.name. Leave blank to check the whole item.", valueType: "string", defaultValue: "", ui: { control: "path", placeholder: "field.path" } },
    {
      id: "operator",
      label: "Match rule",
      description: "How each item is compared with the value below.",
      valueType: "string",
      defaultValue: "exists",
      options: [
        { label: "Field exists", value: "exists" },
        { label: "Equals", value: "equals" },
        { label: "Does not equal", value: "not-equals" },
        { label: "Greater than", value: "greater-than" },
        { label: "Less than", value: "less-than" },
        { label: "Contains", value: "contains" }
      ]
    },
    { id: "value", label: "Value to compare", description: "The value each item is checked against.", valueType: "any", defaultValue: null, ui: { control: "value" } },
    {
      id: "onInvalid",
      label: "If the field is missing",
      description: "Choose whether items with no matching field should stay in the list.",
      valueType: "string",
      defaultValue: "exclude",
      options: [
        { label: "Remove item", value: "exclude" },
        { label: "Keep item", value: "include" }
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
