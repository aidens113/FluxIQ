import { durationMs } from "./shared.ts";
import { defineBuiltinNode, emptyResult } from "../shared/definition.ts";

export const timeoutNode = defineBuiltinNode({
  id: "builtin.timing.timeout",
  label: "Timeout",
  description: "Fail or route when a branch takes too long.",
  class: "timing",
  scope: "both",
  inputs: [{ id: "in", label: "In", valueType: "any" }],
  outputs: [
    { id: "success", label: "Success", valueType: "any" },
    { id: "timeout", label: "Timeout", valueType: "any" }
  ],
  parameters: [
    { id: "timeoutMs", label: "Give up after milliseconds", description: "Maximum time this branch may run before taking the timeout path.", valueType: "number", defaultValue: 5000 },
    { id: "timeoutRoute", label: "If time runs out", description: "Usually timeout. Success is available when waiting too long is acceptable.", valueType: "string", defaultValue: "timeout", options: [{ label: "Go to Timeout", value: "timeout" }, { label: "Continue as Success", value: "success" }] },
    { id: "cancelOnTimeout", label: "Stop branch when time runs out", description: "Ask the runtime to cancel any still-running work in this branch.", valueType: "boolean", defaultValue: true }
  ],
  icon: "clock-alert",
  execute: (context) => emptyResult({ success: context.inputs.in ?? null, timeoutMs: durationMs(context.parameters.timeoutMs, 5000), timeoutRoute: context.parameters.timeoutRoute ?? "timeout", cancelOnTimeout: context.parameters.cancelOnTimeout !== false })
});
