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
  parameters: [{ id: "cases", label: "Cases", valueType: "json", defaultValue: [] }],
  icon: "split",
  execute: (context) => {
    const cases = Array.isArray(context.parameters.cases) ? context.parameters.cases : [];
    const match = cases.find((item) => typeof item === "object" && item !== null && "value" in item && item.value === context.inputs.value);
    return { status: "success", route: typeof match === "object" && match && "route" in match ? String(match.route) : "default", outputs: { value: context.inputs.value ?? null } };
  }
});
