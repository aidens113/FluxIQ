import { durationMs } from "./shared";
import { defineBuiltinNode, emptyResult } from "../shared/definition";

export const retryNode = defineBuiltinNode({
  id: "builtin.timing.retry",
  label: "Retry",
  description: "Retry a branch with bounded attempts and delay.",
  class: "timing",
  scope: "both",
  inputs: [{ id: "in", label: "In", valueType: "any" }],
  outputs: [
    { id: "success", label: "Success", valueType: "any" },
    { id: "failed", label: "Failed", valueType: "any" }
  ],
  parameters: [
    { id: "attempts", label: "Attempts", valueType: "number", defaultValue: 3 },
    { id: "delayMs", label: "Delay ms", valueType: "number", defaultValue: 500 },
    {
      id: "backoff",
      label: "Backoff",
      valueType: "string",
      defaultValue: "fixed",
      options: [
        { label: "Fixed", value: "fixed" },
        { label: "Linear", value: "linear" },
        { label: "Exponential", value: "exponential" }
      ]
    },
    { id: "jitterMs", label: "Jitter ms", valueType: "number", defaultValue: 0 }
  ],
  icon: "refresh-cw",
  execute: (context) => emptyResult({ success: context.inputs.in ?? null, attempts: durationMs(context.parameters.attempts, 3), delayMs: durationMs(context.parameters.delayMs, 500), backoff: context.parameters.backoff ?? "fixed", jitterMs: durationMs(context.parameters.jitterMs, 0) })
});
