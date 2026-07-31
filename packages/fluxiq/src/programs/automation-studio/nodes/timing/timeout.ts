import { durationMs } from "./shared";
import { defineBuiltinNode, emptyResult } from "../shared/definition";

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
    { id: "timeoutMs", label: "Timeout ms", valueType: "number", defaultValue: 5000 },
    { id: "timeoutRoute", label: "Timeout route", valueType: "string", defaultValue: "timeout", options: [{ label: "Timeout", value: "timeout" }, { label: "Success", value: "success" }] },
    { id: "cancelOnTimeout", label: "Cancel branch on timeout", valueType: "boolean", defaultValue: true }
  ],
  icon: "clock-alert",
  execute: (context) => emptyResult({ success: context.inputs.in ?? null, timeoutMs: durationMs(context.parameters.timeoutMs, 5000), timeoutRoute: context.parameters.timeoutRoute ?? "timeout", cancelOnTimeout: context.parameters.cancelOnTimeout !== false })
});
