import type { AutomationNodeDefinition } from "../contracts";

export const timingNodes: AutomationNodeDefinition[] = [
  {
    id: "builtin.timing.wait",
    label: "Wait",
    description: "Pause execution for a fixed duration.",
    class: "timing",
    scope: "both",
    origin: "builtin",
    inputs: [{ id: "in", label: "In", valueType: "any" }],
    outputs: [{ id: "next", label: "Next", valueType: "any" }],
    parameters: [{ id: "durationMs", label: "Duration ms", valueType: "number", defaultValue: 1000 }],
    icon: "timer"
  },
  {
    id: "builtin.timing.timeout",
    label: "Timeout",
    description: "Fail or route when a branch takes too long.",
    class: "timing",
    scope: "both",
    origin: "builtin",
    inputs: [{ id: "in", label: "In", valueType: "any" }],
    outputs: [
      { id: "success", label: "Success", valueType: "any" },
      { id: "timeout", label: "Timeout", valueType: "any" }
    ],
    parameters: [{ id: "timeoutMs", label: "Timeout ms", valueType: "number", defaultValue: 5000 }],
    icon: "clock-alert"
  },
  {
    id: "builtin.timing.retry",
    label: "Retry",
    description: "Retry a branch with bounded attempts and delay.",
    class: "timing",
    scope: "both",
    origin: "builtin",
    inputs: [{ id: "in", label: "In", valueType: "any" }],
    outputs: [
      { id: "success", label: "Success", valueType: "any" },
      { id: "failed", label: "Failed", valueType: "any" }
    ],
    parameters: [
      { id: "attempts", label: "Attempts", valueType: "number", defaultValue: 3 },
      { id: "delayMs", label: "Delay ms", valueType: "number", defaultValue: 500 }
    ],
    icon: "refresh-cw"
  },
  {
    id: "builtin.timing.debounce",
    label: "Debounce",
    description: "Allow a branch only after input has been stable.",
    class: "timing",
    scope: "both",
    origin: "builtin",
    inputs: [{ id: "signal", label: "Signal", valueType: "signal", required: true }],
    outputs: [{ id: "stable", label: "Stable", valueType: "boolean" }],
    parameters: [{ id: "windowMs", label: "Window ms", valueType: "number", defaultValue: 250 }],
    icon: "activity"
  }
];
