import type { AutomationNodeDefinition } from "../contracts";

export const randomNodes: AutomationNodeDefinition[] = [
  {
    id: "builtin.random.number",
    label: "Random Number",
    description: "Produce a random number in a configured range.",
    class: "random",
    scope: "both",
    origin: "builtin",
    inputs: [],
    outputs: [{ id: "value", label: "Value", valueType: "number" }],
    parameters: [
      { id: "min", label: "Minimum", valueType: "number", defaultValue: 0 },
      { id: "max", label: "Maximum", valueType: "number", defaultValue: 1 }
    ],
    icon: "dice-5"
  },
  {
    id: "builtin.random.choice",
    label: "Random Choice",
    description: "Select one value from a list.",
    class: "random",
    scope: "both",
    origin: "builtin",
    inputs: [{ id: "choices", label: "Choices", valueType: "array", required: true }],
    outputs: [{ id: "choice", label: "Choice", valueType: "any" }],
    parameters: [],
    icon: "shuffle"
  },
  {
    id: "builtin.random.weighted-choice",
    label: "Weighted Choice",
    description: "Select one value from weighted options.",
    class: "random",
    scope: "both",
    origin: "builtin",
    inputs: [{ id: "choices", label: "Weighted choices", valueType: "array", required: true }],
    outputs: [{ id: "choice", label: "Choice", valueType: "any" }],
    parameters: [],
    icon: "scale"
  },
  {
    id: "builtin.random.jitter",
    label: "Jitter",
    description: "Add bounded randomness to a numeric value.",
    class: "random",
    scope: "both",
    origin: "builtin",
    inputs: [{ id: "value", label: "Value", valueType: "number", required: true }],
    outputs: [{ id: "value", label: "Value", valueType: "number" }],
    parameters: [{ id: "amount", label: "Amount", valueType: "number", defaultValue: 0.1 }],
    icon: "waves"
  }
];
