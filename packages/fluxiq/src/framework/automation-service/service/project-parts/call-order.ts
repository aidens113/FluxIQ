import { AUTOMATION_STUDIO_CALL_SUBFLOW_DEFINITION_ID } from "../../../../components/automation/control-flow/index.ts";
import { automationStudioPartPinOf, type AutomationStudioPartPin } from "../../../../engine/automation/frames/index.ts";
import type { AutomationStudioAppliedFlowPart } from "./types.ts";

/** The Subflow ids of this Flow that a graph's call steps name by a literal, with the node that calls each. */
export function projectPartCallTargets(entry: AutomationStudioAppliedFlowPart): { nodeId: string; subflowId: string }[] {
  return entry.graphFlow.nodes.flatMap((node) => {
    const target = node.parameterValues?.subflowId;
    return node.definitionId === AUTOMATION_STUDIO_CALL_SUBFLOW_DEFINITION_ID && typeof target === "string" ? [{ nodeId: node.id, subflowId: target }] : [];
  });
}

/** Each step of a graph that names a Subflow by a literal not at all, and pins a saved part. */
export function projectPartPinnedCalls(graph: Pick<AutomationStudioAppliedFlowPart["graphFlow"], "nodes">): { nodeId: string; pin: AutomationStudioPartPin }[] {
  return graph.nodes.flatMap((node) => {
    if (node.definitionId !== AUTOMATION_STUDIO_CALL_SUBFLOW_DEFINITION_ID || typeof node.parameterValues?.subflowId === "string") return [];
    const pin = automationStudioPartPinOf(node.parameterValues?.part);
    return pin ? [{ nodeId: node.id, pin }] : [];
  });
}

/**
 * The parts in an order a caller comes after what it calls, and the ones that sit
 * on a cycle of calls, which no order can put first.
 */
export function projectPartCallOrder(entries: readonly AutomationStudioAppliedFlowPart[]): { ordered: AutomationStudioAppliedFlowPart[]; cyclic: Set<string> } {
  const byId = new Map(entries.map((entry) => [entry.subflow.subflowId, entry]));
  const ordered: AutomationStudioAppliedFlowPart[] = [];
  const done = new Set<string>();
  const cyclic = new Set<string>();
  const path: string[] = [];
  const visit = (id: string): void => {
    const entry = byId.get(id);
    if (!entry || done.has(id)) return;
    const at = path.indexOf(id);
    if (at >= 0) {
      for (const member of path.slice(at)) cyclic.add(member);
      return;
    }
    path.push(id);
    for (const target of projectPartCallTargets(entry)) visit(target.subflowId);
    path.pop();
    done.add(id);
    ordered.push(entry);
  };
  for (const entry of entries) visit(entry.subflow.subflowId);
  return { ordered, cyclic };
}
