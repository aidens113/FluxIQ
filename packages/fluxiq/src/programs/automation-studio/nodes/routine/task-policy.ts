import { referenceId } from "./shared";
import { defineBuiltinNode } from "../shared/definition";

export const taskPolicyNode = defineBuiltinNode({
  id: "builtin.routine.task-policy",
  label: "Task Policy",
  description: "Run a task policy from a routine graph.",
  class: "routine",
  scope: "routine",
  inputs: [{ id: "in", label: "In", valueType: "any" }],
  outputs: [
    { id: "success", label: "Success", valueType: "any" },
    { id: "failure", label: "Failure", valueType: "any" }
  ],
  parameters: [{ id: "taskId", label: "Task", valueType: "string", required: true }],
  icon: "network",
  execute: (context) => ({
    status: "success",
    route: "success",
    outputs: { success: context.inputs.in ?? null },
    effects: [{ type: "routine.task-policy.requested", payload: { taskId: referenceId(context.parameters.taskId) } }]
  })
});
