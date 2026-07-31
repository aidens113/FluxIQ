import { defineBuiltinNode, emptyResult } from "../shared/definition";

export const parallelNode = defineBuiltinNode({
  id: "builtin.control.parallel",
  label: "Parallel",
  description: "Start multiple branches at the same time.",
  class: "control-flow",
  scope: "routine",
  inputs: [{ id: "in", label: "In", valueType: "any" }],
  outputs: [{ id: "branches", label: "Branches", valueType: "any", multiple: true }],
  parameters: [
    { id: "branchCount", label: "Number of branches", description: "How many parallel paths this node should create.", valueType: "number", defaultValue: 2 },
    {
      id: "failureMode",
      label: "If one branch fails",
      description: "Choose whether the routine stops immediately or waits to collect every branch result.",
      valueType: "string",
      defaultValue: "fail-fast",
      options: [
        { label: "Stop the others", value: "fail-fast" },
        { label: "Wait for all results", value: "collect-all" }
      ]
    }
  ],
  icon: "workflow",
  execute: (context) => emptyResult({ branches: context.inputs.in ?? null, branchCount: context.parameters.branchCount ?? 2, failureMode: context.parameters.failureMode ?? "fail-fast" })
});
