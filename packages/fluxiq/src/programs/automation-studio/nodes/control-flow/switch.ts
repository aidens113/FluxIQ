import { defineBuiltinNode } from "../shared/definition.ts";

export const switchNode = defineBuiltinNode({
  id: "builtin.control.switch",
  label: "Switch",
  description: "Choose a path by matching one value against a list of cases.",
  class: "control-flow",
  scope: "both",
  inputs: [{ id: "value", label: "Value", valueType: "any", required: true }],
  outputs: [
    { id: "case", label: "Cases", valueType: "any", multiple: true },
    { id: "default", label: "Default", valueType: "any" },
    { id: "value", label: "Matched value", valueType: "any" }
  ],
  parameters: [
    { id: "cases", label: "Case list", description: "Values to match. Each item can include a value and optional route name.", valueType: "array", defaultValue: [] },
    { id: "caseSensitive", label: "Match capitalization exactly", description: "When disabled, text like Ready and ready are treated the same.", valueType: "boolean", defaultValue: true },
    {
      id: "matchMode",
      label: "How to match",
      description: "Equals requires an exact match. Contains matches when the input text includes the case text.",
      valueType: "string",
      defaultValue: "equals",
      options: [
        { label: "Equals", value: "equals" },
        { label: "Contains", value: "contains" }
      ]
    }
  ],
  icon: "split",
  execute: (context) => {
    const cases = Array.isArray(context.parameters.cases) ? context.parameters.cases : [];
    const value = context.parameters.caseSensitive === false ? String(context.inputs.value ?? "").toLowerCase() : context.inputs.value;
    const match = cases.find((item) => {
      if (!(typeof item === "object" && item !== null && "value" in item)) return false;
      const candidate = context.parameters.caseSensitive === false ? String(item.value ?? "").toLowerCase() : item.value;
      return context.parameters.matchMode === "contains" ? String(value ?? "").includes(String(candidate ?? "")) : candidate === value;
    });
    return { status: "success", route: match ? "case" : "default", outputs: { value: context.inputs.value ?? null, matched: match ?? null } };
  }
});
