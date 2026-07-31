import { referenceId } from "./shared";
import { defineBuiltinNode } from "../shared/definition";

export const subroutineNode = defineBuiltinNode({
  id: "builtin.routine.subroutine",
  label: "Subroutine",
  description: "Run another routine as a reusable graph step.",
  class: "routine",
  scope: "routine",
  inputs: [{ id: "in", label: "In", valueType: "any" }],
  outputs: [
    { id: "success", label: "Success", valueType: "any" },
    { id: "failed", label: "Failed", valueType: "any" }
  ],
  parameters: [
    { id: "routineId", label: "Routine", valueType: "string", required: true, ui: { control: "reference", referenceType: "routine", placeholder: "routine.id" } },
    { id: "inputs", label: "Routine inputs", valueType: "object", defaultValue: {} },
    {
      id: "isolation",
      label: "Isolation",
      valueType: "string",
      defaultValue: "shared",
      options: [
        { label: "Shared context", value: "shared" },
        { label: "Isolated context", value: "isolated" }
      ]
    }
  ],
  icon: "boxes",
  execute: (context) => ({
    status: "success",
    route: "success",
    outputs: { success: context.inputs.in ?? null },
    effects: [{ type: "routine.subroutine.requested", payload: { routineId: referenceId(context.parameters.routineId), inputs: context.parameters.inputs ?? {}, isolation: context.parameters.isolation ?? "shared" } }]
  })
});
