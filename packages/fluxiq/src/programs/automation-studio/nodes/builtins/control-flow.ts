import type { AutomationNodeDefinition } from "../contracts";

export const controlFlowNodes: AutomationNodeDefinition[] = [
  {
    id: "builtin.control.start",
    label: "Start",
    description: "Entry point for a policy or routine graph.",
    class: "control-flow",
    scope: "both",
    origin: "builtin",
    inputs: [],
    outputs: [{ id: "next", label: "Next", valueType: "any" }],
    parameters: [],
    icon: "play"
  },
  {
    id: "builtin.control.end",
    label: "End",
    description: "Terminal point for a policy or routine graph.",
    class: "control-flow",
    scope: "both",
    origin: "builtin",
    inputs: [{ id: "in", label: "In", valueType: "any" }],
    outputs: [],
    parameters: [],
    icon: "circle-stop"
  },
  {
    id: "builtin.control.branch",
    label: "Branch",
    description: "Route execution through yes/no paths.",
    class: "control-flow",
    scope: "both",
    origin: "builtin",
    inputs: [{ id: "condition", label: "Condition", valueType: "boolean", required: true }],
    outputs: [
      { id: "true", label: "True", valueType: "any" },
      { id: "false", label: "False", valueType: "any" }
    ],
    parameters: [],
    icon: "git-branch"
  },
  {
    id: "builtin.control.switch",
    label: "Switch",
    description: "Route execution by matching one value against named cases.",
    class: "control-flow",
    scope: "both",
    origin: "builtin",
    inputs: [{ id: "value", label: "Value", valueType: "any", required: true }],
    outputs: [
      { id: "case", label: "Cases", valueType: "any", multiple: true },
      { id: "default", label: "Default", valueType: "any" }
    ],
    parameters: [{ id: "cases", label: "Cases", valueType: "json", defaultValue: [] }],
    icon: "split"
  },
  {
    id: "builtin.control.parallel",
    label: "Parallel",
    description: "Fan out into parallel branches.",
    class: "control-flow",
    scope: "routine",
    origin: "builtin",
    inputs: [{ id: "in", label: "In", valueType: "any" }],
    outputs: [{ id: "branches", label: "Branches", valueType: "any", multiple: true }],
    parameters: [],
    icon: "workflow"
  },
  {
    id: "builtin.control.merge",
    label: "Merge",
    description: "Join multiple incoming branches into one path.",
    class: "control-flow",
    scope: "routine",
    origin: "builtin",
    inputs: [{ id: "branches", label: "Branches", valueType: "any", multiple: true }],
    outputs: [{ id: "next", label: "Next", valueType: "any" }],
    parameters: [],
    icon: "merge"
  },
  {
    id: "builtin.control.loop",
    label: "Loop",
    description: "Repeat a branch while a condition allows it.",
    class: "control-flow",
    scope: "routine",
    origin: "builtin",
    inputs: [{ id: "condition", label: "Condition", valueType: "boolean", required: true }],
    outputs: [
      { id: "body", label: "Body", valueType: "any" },
      { id: "done", label: "Done", valueType: "any" }
    ],
    parameters: [{ id: "maxIterations", label: "Max iterations", valueType: "number", defaultValue: 25 }],
    icon: "repeat"
  }
];
