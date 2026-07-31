import { durationFromUnit } from "./shared";
import { defineBuiltinNode } from "../shared/definition";

export const waitNode = defineBuiltinNode({
  id: "builtin.timing.wait",
  label: "Wait",
  description: "Pause execution for a fixed duration.",
  class: "timing",
  scope: "both",
  inputs: [{ id: "in", label: "In", valueType: "any" }],
  outputs: [{ id: "next", label: "Next", valueType: "any" }],
  parameters: [
    { id: "duration", label: "Duration", valueType: "number", defaultValue: 1000 },
    {
      id: "unit",
      label: "Unit",
      valueType: "string",
      defaultValue: "milliseconds",
      options: [
        { label: "Milliseconds", value: "milliseconds" },
        { label: "Seconds", value: "seconds" },
        { label: "Minutes", value: "minutes" }
      ]
    },
    { id: "jitterMs", label: "Jitter ms", valueType: "number", defaultValue: 0 }
  ],
  icon: "timer",
  execute: (context) => {
    const base = durationFromUnit(context.parameters.duration, context.parameters.unit, 1000);
    const jitter = Math.max(0, Number(context.parameters.jitterMs ?? 0));
    const random = context.random ? context.random() : 0.5;
    return { status: "waiting", route: "next", outputs: { next: context.inputs.in ?? null, durationMs: Math.max(0, Math.round(base + (random * 2 - 1) * jitter)) } };
  }
});
