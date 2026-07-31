import { defineBuiltinNode } from "../shared/definition";

export const switchNode = defineBuiltinNode({
  id: "builtin.control.switch",
  label: "Switch",
  description: "Route execution by matching one value against named cases.",
  class: "control-flow",
  scope: "both",
  inputs: [{ id: "value", label: "Value", valueType: "any", required: true }],
  outputs: [
    { id: "case", label: "Cases", valueType: "any", multiple: true },
    { id: "default", label: "Default", valueType: "any" }
  ],
  parameters: [
    { id: "cases", label: "Cases", valueType: "array", defaultValue: [] },
    { id: "caseSensitive", label: "Case sensitive", valueType: "boolean", defaultValue: true },
    {
      id: "matchMode",
      label: "Match mode",
      valueType: "string",
      defaultValue: "equals",
      options: [
        { label: "Equals", value: "equals" },
        { label: "Contains", value: "contains" }
      ]
    },
    { id: "defaultRoute", label: "Default route", valueType: "string", defaultValue: "default", options: [{ label: "Default", value: "default" }, { label: "Case", value: "case" }] }
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
    return { status: "success", route: typeof match === "object" && match && "route" in match ? String(match.route) : String(context.parameters.defaultRoute ?? "default"), outputs: { value: context.inputs.value ?? null } };
  }
});
