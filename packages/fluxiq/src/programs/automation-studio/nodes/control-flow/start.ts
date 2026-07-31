import { defineBuiltinNode, emptyResult } from "../shared/definition";

export const startNode = defineBuiltinNode({
  id: "builtin.control.start",
  label: "Start",
  description: "Entry point for a policy or routine graph.",
  class: "control-flow",
  scope: "both",
  inputs: [],
  outputs: [{ id: "next", label: "Next", valueType: "any" }],
  parameters: [
    { id: "label", label: "Start label", description: "Friendly name shown for this run entry.", valueType: "string", defaultValue: "Start", ui: { control: "text", placeholder: "Start label" } },
    { id: "emitTimestamp", label: "Include start time", description: "Attach the current time to the value sent from this node.", valueType: "boolean", defaultValue: true }
  ],
  icon: "play",
  execute: (context) => emptyResult({ next: true, label: context.parameters.label ?? "Start", startedAt: context.parameters.emitTimestamp === false ? null : context.now?.() ?? Date.now() })
});
