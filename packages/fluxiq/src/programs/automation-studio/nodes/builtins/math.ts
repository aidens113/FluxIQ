import type { AutomationNodeDefinition } from "../contracts";

const binaryMath = [
  ["add", "Add", "Add two numeric values."],
  ["subtract", "Subtract", "Subtract one numeric value from another."],
  ["multiply", "Multiply", "Multiply two numeric values."],
  ["divide", "Divide", "Divide one numeric value by another."]
] as const;

export const mathNodes: AutomationNodeDefinition[] = [
  ...binaryMath.map(([id, label, description]) => ({
    id: `builtin.math.${id}`,
    label,
    description,
    class: "math" as const,
    scope: "both" as const,
    origin: "builtin" as const,
    inputs: [
      { id: "left", label: "Left", valueType: "number" as const, required: true },
      { id: "right", label: "Right", valueType: "number" as const, required: true }
    ],
    outputs: [{ id: "result", label: "Result", valueType: "number" as const }],
    parameters: [],
    icon: "calculator"
  })),
  {
    id: "builtin.math.clamp",
    label: "Clamp",
    description: "Clamp a number between minimum and maximum bounds.",
    class: "math",
    scope: "both",
    origin: "builtin",
    inputs: [{ id: "value", label: "Value", valueType: "number", required: true }],
    outputs: [{ id: "result", label: "Result", valueType: "number" }],
    parameters: [
      { id: "min", label: "Minimum", valueType: "number", defaultValue: 0 },
      { id: "max", label: "Maximum", valueType: "number", defaultValue: 1 }
    ],
    icon: "between-horizontal-start"
  },
  {
    id: "builtin.math.round",
    label: "Round",
    description: "Round a numeric value to a configured precision.",
    class: "math",
    scope: "both",
    origin: "builtin",
    inputs: [{ id: "value", label: "Value", valueType: "number", required: true }],
    outputs: [{ id: "result", label: "Result", valueType: "number" }],
    parameters: [{ id: "precision", label: "Precision", valueType: "number", defaultValue: 0 }],
    icon: "circle-dot"
  }
];
