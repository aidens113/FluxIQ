import { everyBoolean } from "./shared";
import { defineBuiltinNode, arrayValue } from "../shared/definition";

export const andNode = defineBuiltinNode({
  id: "builtin.logic.and",
  label: "And",
  description: "Return true when all input conditions are true.",
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
      defaultValue: "true",
      options: [
        { label: "Treat as true", value: "true" },
        { label: "Treat as false", value: "false" }
      ]
    }
  ],
  icon: "ampersand",
  execute: (context) => {
    const conditions = arrayValue(context.inputs.conditions);
    const result = conditions.length ? everyBoolean(conditions) : context.parameters.emptyBehavior !== "false";
    return { status: "success", route: result ? "true" : "false", outputs: { result } };
  }
});
