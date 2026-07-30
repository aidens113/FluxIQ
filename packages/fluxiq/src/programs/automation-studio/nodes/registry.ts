import type { AutomationNodeClass, AutomationNodeClassGroup, AutomationNodeDefinition, AutomationNodeScope } from "./contracts";
import { controlFlowNodes, dataNodes, logicNodes, mathNodes, policyNodes, randomNodes, routineNodes, timingNodes } from "./builtins";

export const automationNodeClassGroups: AutomationNodeClassGroup[] = [
  { id: "control-flow", label: "Control Flow", description: "Graph routing, branching, joining, and lifecycle nodes." },
  { id: "policy", label: "Policy", description: "Task policy action, expectation, and recovery nodes." },
  { id: "routine", label: "Routine", description: "Routine orchestration nodes that call tasks or subroutines." },
  { id: "logic", label: "Logic", description: "Boolean and comparison nodes." },
  { id: "math", label: "Math", description: "Numeric transform nodes." },
  { id: "random", label: "Random", description: "Random number, choice, and jitter nodes." },
  { id: "data", label: "Data", description: "Variable, constant, object, and list transform nodes." },
  { id: "timing", label: "Timing", description: "Wait, timeout, retry, and debounce nodes." },
  { id: "runtime", label: "Runtime", description: "Future runtime/debug-specific nodes." },
  { id: "custom", label: "Custom", description: "Host-added node definitions loaded from .fluxiq." }
];

export const builtinAutomationNodeDefinitions: AutomationNodeDefinition[] = [
  ...controlFlowNodes,
  ...policyNodes,
  ...routineNodes,
  ...logicNodes,
  ...mathNodes,
  ...randomNodes,
  ...dataNodes,
  ...timingNodes
];

export const automationNodeClasses = automationNodeClassGroups.map((group) => group.id);

export function getAutomationNodeDefinitions(scope?: AutomationNodeScope): AutomationNodeDefinition[] {
  if (!scope) return [...builtinAutomationNodeDefinitions];
  return builtinAutomationNodeDefinitions.filter((node) => node.scope === scope || node.scope === "both");
}

export function getAutomationNodeDefinitionsByClass(scope?: AutomationNodeScope): Map<AutomationNodeClass, AutomationNodeDefinition[]> {
  const grouped = new Map<AutomationNodeClass, AutomationNodeDefinition[]>();
  for (const node of getAutomationNodeDefinitions(scope)) {
    grouped.set(node.class, [...(grouped.get(node.class) ?? []), node]);
  }
  return grouped;
}
