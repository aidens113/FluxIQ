import { defineBuiltinNode, emptyResult } from "../shared/definition";

export const parallelNode = defineBuiltinNode({
  id: "builtin.control.parallel",
  label: "Parallel",
  description: "Fan out into parallel branches.",
  class: "control-flow",
  scope: "routine",
  inputs: [{ id: "in", label: "In", valueType: "any" }],
  outputs: [{ id: "branches", label: "Branches", valueType: "any", multiple: true }],
  parameters: [
    { id: "branchCount", label: "Branch count", valueType: "number", defaultValue: 2 },
    {
      id: "failureMode",
      label: "Failure mode",
      valueType: "string",
      defaultValue: "fail-fast",
      options: [
        { label: "Fail fast", value: "fail-fast" },
        { label: "Collect all", value: "collect-all" }
      ]
    }
  ],
  icon: "workflow",
  execute: (context) => emptyResult({ branches: context.inputs.in ?? null, branchCount: context.parameters.branchCount ?? 2, failureMode: context.parameters.failureMode ?? "fail-fast" })
});
