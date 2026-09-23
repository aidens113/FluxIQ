import { automationStudioAskEffect } from "../../runtime/parking/index.ts";
import { defineBuiltinNode } from "../shared/definition.ts";

/**
 * Stops the routine and asks a person to approve it, then goes on down the
 * route their answer chooses.
 *
 * The node raises an ask and returns `waiting`; the executor is what parks the
 * run on it, carries the question out to wherever a person is, and resumes the
 * run from the answer without running this node again. Nothing here knows what
 * a conversation is, and nothing about parking is particular to this node --
 * anything inside a run that emits the same effect waits the same way.
 */
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
  execute: (context) => {
    const carried = context.inputs.in ?? null;
    const timeoutMs = approvalTimeoutMs(context.parameters.timeoutMs);
    return {
      status: "waiting",
      // Both branches carry what arrived, so whichever route the answer takes
      // reaches the next node with the same value.
      outputs: { approved: carried, rejected: carried },
      effects: [automationStudioAskEffect({
        kind: "confirm",
        parks: true,
        text: approvalPrompt(context.parameters.prompt),
        ...(timeoutMs > 0 ? { timeoutMs } : {}),
        routes: { answered: "approved", denied: "rejected", expired: approvalDefaultRoute(context.parameters.defaultRoute) }
      })]
    };
  }
});

function approvalPrompt(value: unknown): string {
  const text = typeof value === "string" ? value.trim() : "";
  return text || "Approve this routine step?";
}

/** A parameter that is not a positive whole number of milliseconds waits indefinitely, as the parameter's own description says. */
function approvalTimeoutMs(value: unknown): number {
  const milliseconds = Number(value ?? 0);
  return Number.isFinite(milliseconds) && milliseconds > 0 ? Math.floor(milliseconds) : 0;
}

/** Only the two routes the parameter offers; anything else is the declared default. */
function approvalDefaultRoute(value: unknown): "approved" | "rejected" {
  return value === "approved" ? "approved" : "rejected";
}
