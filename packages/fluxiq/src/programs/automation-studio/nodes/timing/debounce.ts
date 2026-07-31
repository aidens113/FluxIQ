import { durationMs } from "./shared";
import { defineBuiltinNode, emptyResult } from "../shared/definition";

export const debounceNode = defineBuiltinNode({
  id: "builtin.timing.debounce",
  label: "Debounce",
  description: "Allow a branch only after input has been stable.",
  class: "timing",
  scope: "both",
  inputs: [{ id: "signal", label: "Signal", valueType: "signal", required: true }],
  outputs: [{ id: "stable", label: "Stable", valueType: "boolean" }],
  parameters: [
    { id: "windowMs", label: "Window ms", valueType: "number", defaultValue: 250 },
    {
      id: "edge",
      label: "Edge",
      valueType: "string",
      defaultValue: "trailing",
      options: [
        { label: "Trailing", value: "trailing" },
        { label: "Leading", value: "leading" },
        { label: "Both", value: "both" }
      ]
    }
  ],
  icon: "activity",
  execute: (context) => emptyResult({ stable: Boolean(context.inputs.signal), windowMs: durationMs(context.parameters.windowMs, 250), edge: context.parameters.edge ?? "trailing" })
});
