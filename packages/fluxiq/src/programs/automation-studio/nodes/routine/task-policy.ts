import { referenceId } from "./shared.ts";
import { defineBuiltinNode } from "../shared/definition.ts";

export const taskPolicyNode = defineBuiltinNode({
  id: "builtin.routine.task-policy",
  label: "Run Task",
  description: "Run a saved task policy from this routine.",
  class: "routine",
  scope: "routine",
  inputs: [{ id: "in", label: "In", valueType: "any" }],
  outputs: [
    { id: "success", label: "Success", valueType: "any" },
    { id: "failed", label: "Failed", valueType: "any" }
  ],
  parameters: [
    { id: "taskId", label: "Task to run", description: "Choose the saved task this routine step should start.", valueType: "string", required: true, ui: { control: "reference", referenceType: "task", placeholder: "Choose a task" } },
    { id: "policyId", label: "Specific policy version", description: "Optional override. Leave blank to use the task's default policy.", valueType: "string", defaultValue: "", ui: { control: "reference", referenceType: "policy", placeholder: "Default policy" } },
    { id: "inputs", label: "Values to pass in", description: "Input values made available to the task.", valueType: "object", defaultValue: {} },
    { id: "waitForCompletion", label: "Wait until task finishes", description: "When enabled, the routine pauses until this task reports success or failure.", valueType: "boolean", defaultValue: true }
  ],
  icon: "network",
  execute: (context) => ({
    status: "success",
    route: "success",
    outputs: { success: context.inputs.in ?? null },
    effects: [{ type: "routine.task-policy.requested", payload: { taskId: referenceId(context.parameters.taskId), policyId: referenceId(context.parameters.policyId), inputs: context.parameters.inputs ?? {}, waitForCompletion: context.parameters.waitForCompletion !== false } }]
  })
});
