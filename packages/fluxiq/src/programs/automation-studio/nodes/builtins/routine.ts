import type { AutomationNodeDefinition } from "../contracts";

export const routineNodes: AutomationNodeDefinition[] = [
  {
    id: "builtin.routine.task-policy",
    label: "Task Policy",
    description: "Run a task policy from a routine graph.",
    class: "routine",
    scope: "routine",
    origin: "builtin",
    inputs: [{ id: "in", label: "In", valueType: "any" }],
    outputs: [
      { id: "success", label: "Success", valueType: "any" },
      { id: "failure", label: "Failure", valueType: "any" }
    ],
    parameters: [{ id: "taskId", label: "Task", valueType: "string", required: true }],
    icon: "network"
  },
  {
    id: "builtin.routine.subroutine",
    label: "Subroutine",
    description: "Run another routine as a reusable graph step.",
    class: "routine",
    scope: "routine",
    origin: "builtin",
    inputs: [{ id: "in", label: "In", valueType: "any" }],
    outputs: [
      { id: "success", label: "Success", valueType: "any" },
      { id: "failure", label: "Failure", valueType: "any" }
    ],
    parameters: [{ id: "routineId", label: "Routine", valueType: "string", required: true }],
    icon: "boxes"
  },
  {
    id: "builtin.routine.approval",
    label: "Approval",
    description: "Pause a routine until an operator approves or rejects it.",
    class: "routine",
    scope: "routine",
    origin: "builtin",
    inputs: [{ id: "in", label: "In", valueType: "any" }],
    outputs: [
      { id: "approved", label: "Approved", valueType: "any" },
      { id: "rejected", label: "Rejected", valueType: "any" }
    ],
    parameters: [{ id: "prompt", label: "Prompt", valueType: "string", defaultValue: "Approve this routine step?" }],
    icon: "badge-check"
  }
];
