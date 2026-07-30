import type { AutomationNodeDefinition } from "../contracts";

export const policyNodes: AutomationNodeDefinition[] = [
  {
    id: "builtin.policy.action",
    label: "Action",
    description: "Dispatch a domain-provided action through a declared channel.",
    class: "policy",
    scope: "policy",
    origin: "builtin",
    inputs: [{ id: "ready", label: "Ready", valueType: "boolean" }],
    outputs: [
      { id: "success", label: "Success", valueType: "any" },
      { id: "failure", label: "Failure", valueType: "any" }
    ],
    parameters: [
      { id: "actionDefinitionId", label: "Action definition", valueType: "string", required: true },
      { id: "parameters", label: "Parameters", valueType: "json", defaultValue: {} }
    ],
    icon: "zap",
    privileged: true
  },
  {
    id: "builtin.policy.expectation",
    label: "Expectation",
    description: "Check success, failure, or invariant conditions after an action.",
    class: "policy",
    scope: "policy",
    origin: "builtin",
    inputs: [{ id: "signals", label: "Signals", valueType: "signal", multiple: true }],
    outputs: [
      { id: "passed", label: "Passed", valueType: "boolean" },
      { id: "failed", label: "Failed", valueType: "boolean" }
    ],
    parameters: [{ id: "conditions", label: "Conditions", valueType: "json", defaultValue: [] }],
    icon: "list-checks"
  },
  {
    id: "builtin.policy.recovery",
    label: "Recovery",
    description: "Route a failed policy node to a recovery branch.",
    class: "policy",
    scope: "policy",
    origin: "builtin",
    inputs: [{ id: "failure", label: "Failure", valueType: "any" }],
    outputs: [
      { id: "recovered", label: "Recovered", valueType: "any" },
      { id: "failed", label: "Failed", valueType: "any" }
    ],
    parameters: [{ id: "strategy", label: "Strategy", valueType: "string", defaultValue: "retry" }],
    icon: "shield-check"
  }
];
