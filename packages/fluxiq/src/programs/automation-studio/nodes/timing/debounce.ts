import { durationMs } from "./shared";
import { defineBuiltinNode, emptyResult } from "../shared/definition";

export const debounceNode = defineBuiltinNode({
  id: "builtin.timing.debounce",
  label: "Debounce",
  description: "Continue only after a signal stops changing for a short time.",
  class: "timing",
  scope: "both",
  inputs: [{ id: "signal", label: "Signal", valueType: "signal", required: true }],
  outputs: [{ id: "stable", label: "Stable", valueType: "boolean" }],
  parameters: [
    { id: "windowMs", label: "Stable for milliseconds", description: "How long the signal must remain unchanged.", valueType: "number", defaultValue: 250 },
    {
      id: "edge",
      label: "When to continue",
      description: "Choose whether to continue at the start, end, or both sides of the stable window.",
      valueType: "string",
      defaultValue: "trailing",
      options: [
        { label: "After it stays stable", value: "trailing" },
        { label: "Immediately, then wait", value: "leading" },
        { label: "Both immediate and stable", value: "both" }
      ]
    }
  ],
  icon: "activity",
  execute: (context) => emptyResult({ stable: Boolean(context.inputs.signal), windowMs: durationMs(context.parameters.windowMs, 250), edge: context.parameters.edge ?? "trailing" })
});
