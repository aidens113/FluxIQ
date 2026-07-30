import type { AutomationNodeDefinition } from "../contracts";

export const logicNodes: AutomationNodeDefinition[] = [
  {
    id: "builtin.logic.compare",
    label: "Compare",
    description: "Compare two values with a selected operator.",
    class: "logic",
    scope: "both",
    origin: "builtin",
    inputs: [
      { id: "left", label: "Left", valueType: "any", required: true },
      { id: "right", label: "Right", valueType: "any", required: true }
    ],
    outputs: [{ id: "result", label: "Result", valueType: "boolean" }],
    parameters: [
      {
        id: "operator",
        label: "Operator",
        valueType: "string",
        defaultValue: "equals",
        options: ["equals", "not-equals", "greater-than", "less-than", "contains"].map((value) => ({ label: value, value }))
      }
    ],
    icon: "equal"
  },
  {
    id: "builtin.logic.and",
    label: "And",
    description: "Return true when all input conditions are true.",
    class: "logic",
    scope: "both",
    origin: "builtin",
    inputs: [{ id: "conditions", label: "Conditions", valueType: "boolean", required: true, multiple: true }],
    outputs: [{ id: "result", label: "Result", valueType: "boolean" }],
    parameters: [],
    icon: "ampersand"
  },
  {
    id: "builtin.logic.or",
    label: "Or",
    description: "Return true when any input condition is true.",
    class: "logic",
    scope: "both",
    origin: "builtin",
    inputs: [{ id: "conditions", label: "Conditions", valueType: "boolean", required: true, multiple: true }],
    outputs: [{ id: "result", label: "Result", valueType: "boolean" }],
    parameters: [],
    icon: "list-tree"
  },
  {
    id: "builtin.logic.not",
    label: "Not",
    description: "Invert a boolean condition.",
    class: "logic",
    scope: "both",
    origin: "builtin",
    inputs: [{ id: "condition", label: "Condition", valueType: "boolean", required: true }],
    outputs: [{ id: "result", label: "Result", valueType: "boolean" }],
    parameters: [],
    icon: "badge-x"
  }
];
