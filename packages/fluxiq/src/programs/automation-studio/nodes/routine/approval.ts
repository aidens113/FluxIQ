import { defineBuiltinNode } from "../shared/definition";

export const approvalNode = defineBuiltinNode({
  id: "builtin.routine.approval",
  label: "Approval",
  description: "Pause a routine until an operator approves or rejects it.",
  class: "routine",
  scope: "routine",
  inputs: [{ id: "in", label: "In", valueType: "any" }],
  outputs: [
    { id: "approved", label: "Approved", valueType: "any" },
    { id: "rejected", label: "Rejected", valueType: "any" }
  ],
  parameters: [
    { id: "prompt", label: "Approval message", description: "Message shown to the operator who approves or rejects this step.", valueType: "string", defaultValue: "Approve this routine step?", ui: { control: "textarea", placeholder: "Approval message" } },
    { id: "timeoutMs", label: "Auto-decide after milliseconds", description: "Use 0 to wait indefinitely.", valueType: "number", defaultValue: 0 },
    {
      id: "defaultRoute",
      label: "If nobody responds",
      description: "Route to use when the approval times out.",
      valueType: "string",
      defaultValue: "rejected",
      options: [
        { label: "Treat as rejected", value: "rejected" },
        { label: "Treat as approved", value: "approved" }
      ]
    }
  ],
  icon: "badge-check",
  execute: (context) => ({ status: "waiting", route: "approved", outputs: { approved: context.inputs.in ?? null, timeoutMs: context.parameters.timeoutMs ?? 0, defaultRoute: context.parameters.defaultRoute ?? "rejected" }, effects: [{ type: "routine.approval.requested", payload: { prompt: context.parameters.prompt ?? "", timeoutMs: context.parameters.timeoutMs ?? 0, defaultRoute: context.parameters.defaultRoute ?? "rejected" } }] })
});
