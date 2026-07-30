import { durationMs } from "./shared";
import { defineBuiltinNode } from "../shared/definition";

export const waitNode = defineBuiltinNode({
  id: "builtin.timing.wait",
  label: "Wait",
  description: "Pause execution for a fixed duration.",
  class: "timing",
  scope: "both",
  inputs: [{ id: "in", label: "In", valueType: "any" }],
  outputs: [{ id: "next", label: "Next", valueType: "any" }],
  parameters: [{ id: "durationMs", label: "Duration ms", valueType: "number", defaultValue: 1000 }],
  icon: "timer",
  execute: (context) => ({ status: "waiting", route: "next", outputs: { next: context.inputs.in ?? null, durationMs: durationMs(context.parameters.durationMs, 1000) } })
});
