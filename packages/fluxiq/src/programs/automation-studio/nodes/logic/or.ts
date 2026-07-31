import { someBoolean } from "./shared";
import { defineBuiltinNode, arrayValue } from "../shared/definition";

export const orNode = defineBuiltinNode({
  id: "builtin.logic.or",
  label: "Or",
  description: "Return true when any input condition is true.",
  class: "logic",
  scope: "both",
  inputs: [{ id: "conditions", label: "Conditions", valueType: "boolean", required: true, multiple: true }],
  outputs: [
    { id: "true", label: "True", valueType: "any" },
    { id: "false", label: "False", valueType: "any" },
    { id: "result", label: "Result", valueType: "boolean" }
  ],
  parameters: [
    {
      id: "emptyBehavior",
      label: "If no conditions arrive",
      description: "Fallback result when this node receives no boolean inputs.",
      valueType: "string",
      defaultValue: "false",
      options: [
        { label: "Treat as false", value: "false" },
        { label: "Treat as true", value: "true" }
      ]
    }
  ],
  icon: "list-tree",
  execute: (context) => {
    const conditions = arrayValue(context.inputs.conditions);
    const result = conditions.length ? someBoolean(conditions) : context.parameters.emptyBehavior === "true";
    return { status: "success", route: result ? "true" : "false", outputs: { result } };
  }
});
