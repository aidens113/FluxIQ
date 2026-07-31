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
    { id: "prompt", label: "Prompt", valueType: "string", defaultValue: "Approve this routine step?", ui: { control: "textarea", placeholder: "Approval prompt" } },
    { id: "timeoutMs", label: "Timeout ms", valueType: "number", defaultValue: 0 },
    {
      id: "defaultRoute",
      label: "Timeout/default route",
      valueType: "string",
      defaultValue: "rejected",
      options: [
        { label: "Rejected", value: "rejected" },
        { label: "Approved", value: "approved" }
      ]
    }
  ],
  icon: "badge-check",
  execute: (context) => ({ status: "waiting", route: "approved", outputs: { approved: context.inputs.in ?? null, timeoutMs: context.parameters.timeoutMs ?? 0, defaultRoute: context.parameters.defaultRoute ?? "rejected" }, effects: [{ type: "routine.approval.requested", payload: { prompt: context.parameters.prompt ?? "", timeoutMs: context.parameters.timeoutMs ?? 0, defaultRoute: context.parameters.defaultRoute ?? "rejected" } }] })
});
