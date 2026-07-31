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
    { id: "routineId", label: "Routine to run", description: "Choose the saved routine this node should call.", valueType: "string", required: true, ui: { control: "reference", referenceType: "routine", placeholder: "Choose a routine" } },
    { id: "inputs", label: "Values to pass in", description: "Input values made available to the called routine.", valueType: "object", defaultValue: {} },
    {
      id: "isolation",
      label: "Context sharing",
      description: "Choose whether the called routine can see the current routine's variables.",
      valueType: "string",
      defaultValue: "shared",
      options: [
        { label: "Share current variables", value: "shared" },
        { label: "Use isolated variables", value: "isolated" }
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
