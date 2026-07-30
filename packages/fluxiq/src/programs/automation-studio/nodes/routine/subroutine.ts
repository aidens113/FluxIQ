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
    { id: "failure", label: "Failure", valueType: "any" }
  ],
  parameters: [{ id: "routineId", label: "Routine", valueType: "string", required: true }],
  icon: "boxes",
  execute: (context) => ({
    status: "success",
    route: "success",
    outputs: { success: context.inputs.in ?? null },
    effects: [{ type: "routine.subroutine.requested", payload: { routineId: referenceId(context.parameters.routineId) } }]
  })
});
