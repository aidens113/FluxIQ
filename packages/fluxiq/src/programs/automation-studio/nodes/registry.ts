import type { AutomationNodeClass, AutomationNodeClassGroup, AutomationNodeDefinition, AutomationNodeScope } from "./contracts.ts";
import { controlFlowNodes } from "./control-flow/index.ts";
import { dataNodes } from "./data/index.ts";
import { databaseNodes } from "./database/index.ts";
import { logicNodes } from "./logic/index.ts";
import { mathNodes } from "./math/index.ts";
import { policyNodes } from "./policy/index.ts";
import { randomNodes } from "./random/index.ts";
import { routineNodes } from "./routine/index.ts";
import { timingNodes } from "./timing/index.ts";

export const automationNodeClassGroups: AutomationNodeClassGroup[] = [
  { id: "control-flow", label: "Control Flow", description: "Graph routing, branching, joining, and lifecycle nodes." },
  { id: "policy", label: "Policy", description: "Task policy action, expectation, and recovery nodes." },
  { id: "routine", label: "Routine", description: "Routine orchestration nodes that call tasks or subroutines." },
  { id: "logic", label: "Logic", description: "Boolean and comparison nodes." },
  { id: "math", label: "Math", description: "Numeric transform nodes." },
  { id: "random", label: "Random", description: "Random number, choice, and jitter nodes." },
  { id: "data", label: "Data", description: "Variable, constant, object, and list transform nodes." },
  { id: "database", label: "Database", description: "Database request nodes delegated to host adapters." },
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
  ...databaseNodes,
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

export function getAutomationNodeDefinition(nodeId: string): AutomationNodeDefinition | undefined {
  return builtinAutomationNodeDefinitions.find((node) => node.id === nodeId);
}
