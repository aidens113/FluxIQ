// Small builders for the outline tests' graphs.
import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioFlowEdge, AutomationStudioFlowNode, ExecutableGraph } from "../../graph/index.ts";
import type { AutomationStudioFlowInterface } from "../../interface/index.ts";
import { outlineFlatSteps } from "../walk/index.ts";
import type { FlowOutline, OutlineStep } from "../types/index.ts";

export type FixtureGraph = Pick<ExecutableGraph, "flowId" | "nodes" | "edges"> & { interface?: AutomationStudioFlowInterface };

export function node(id: string, definitionId: string, extra: Partial<AutomationStudioFlowNode> = {}): AutomationStudioFlowNode {
  return { id, definitionId, ...extra };
}

/** A recorded step dispatching `outputId` with `parameters`, labelled as a build labels it. */
export function act(id: string, label: string, parameters: JsonObject = {}, outputId = "site.output.press"): AutomationStudioFlowNode {
  return { id, definitionId: "builtin.policy.action", label, parameterValues: { outputId, parameters } };
}

export function edge(sourceNodeId: string, targetNodeId: string, sourcePortId?: string, targetPortId?: string): AutomationStudioFlowEdge {
  return {
    id: `${sourceNodeId}->${targetNodeId}${sourcePortId ? `:${sourcePortId}` : ""}${targetPortId ? `>${targetPortId}` : ""}`,
    sourceNodeId,
    targetNodeId,
    ...(sourcePortId ? { sourcePortId } : {}),
    ...(targetPortId ? { targetPortId } : {})
  };
}

/** A chain of path edges through the ids in order. */
export function chain(...ids: string[]): AutomationStudioFlowEdge[] {
  return ids.slice(1).map((id, index) => edge(ids[index]!, id));
}

export function graph(nodes: AutomationStudioFlowNode[], edges: AutomationStudioFlowEdge[], flowInterface?: AutomationStudioFlowInterface): FixtureGraph {
  return { flowId: "flow-1", nodes, edges, ...(flowInterface ? { interface: flowInterface } : {}) };
}

/** Each step as "number words", nested by indentation, arms under their words: what a person reads. */
export function readable(outline: FlowOutline): string[] {
  const lines: string[] = [];
  const write = (steps: readonly OutlineStep[], depth: number): void => {
    for (const step of steps) {
      lines.push(`${"  ".repeat(depth)}${step.number ? `${step.number} ` : ""}${step.words}`);
      write(step.children ?? [], depth + 1);
      for (const arm of step.arms ?? []) {
        lines.push(`${"  ".repeat(depth + 1)}${arm.words}`);
        write(arm.steps, depth + 2);
      }
    }
  };
  write(outline.steps, 0);
  return lines;
}

/** How many steps hold each node id. */
export function placements(outline: FlowOutline): Map<string, number> {
  const counts = new Map<string, number>();
  for (const step of outlineFlatSteps(outline.steps)) for (const id of step.nodeIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  return counts;
}
