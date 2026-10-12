import { durationFromUnit } from "./shared.ts";
import { defineBuiltinNode } from "../shared/definition.ts";

/**
 * Wait answers `waiting` with the pause it asks for in `durationMs`, and a
 * graph run takes that pause and goes on down `success`
 * (`runtime/executor/pacing/timed-pause.ts`). Until t378 the run stopped
 * `waiting` on it instead, with nothing parked to resume from, so the node after
 * a Wait never ran.
 */
export const waitNode = defineBuiltinNode({
  id: "builtin.timing.wait",
  label: "Wait",
  description: "Pause execution for a fixed duration.",
  class: "timing",
  scope: "both",
  inputs: [{ id: "in", label: "In", valueType: "any" }],
  outputs: [{ id: "data", label: "Data", valueType: "any" }],
  parameters: [
    { id: "duration", label: "Wait amount", description: "How long this node should pause before continuing.", valueType: "number", defaultValue: 1000 },
    {
      id: "unit",
      label: "Time unit",
      description: "Unit used for the wait amount.",
      valueType: "string",
      defaultValue: "milliseconds",
      options: [
        { label: "Milliseconds", value: "milliseconds" },
        { label: "Seconds", value: "seconds" },
        { label: "Minutes", value: "minutes" }
      ]
    },
    { id: "jitterMs", label: "Random extra wait", description: "Maximum random milliseconds added or subtracted from the wait.", valueType: "number", defaultValue: 0 }
  ],
  icon: "timer",
  execute: (context) => {
    const base = durationFromUnit(context.parameters.duration, context.parameters.unit, 1000);
    const jitter = Math.max(0, Number(context.parameters.jitterMs ?? 0));
    const random = context.random ? context.random() : 0.5;
    return { status: "waiting", route: "success", outputs: { data: context.inputs.in ?? null, durationMs: Math.max(0, Math.round(base + (random * 2 - 1) * jitter)) } };
  }
});
