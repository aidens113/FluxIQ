// Which of the Flow's outputs a node is the source of: the outputs whose
// binding (`metadata.binding`, `$node.<id or key>.<output>`) reads it.
import { automationNodeOutputReference } from "../../../../components/automation/index.ts";
import type { AutomationStudioFlowNode } from "../../graph/index.ts";
import type { AutomationStudioFlowInterface } from "../../interface/index.ts";
import { outlineBindingPaths } from "../graph/index.ts";

/** The names of the outputs the node is the source of. */
export function outlineOutputsFrom(flowInterface: AutomationStudioFlowInterface | undefined, node: AutomationStudioFlowNode): string[] {
  const key = node.metadata?.bootstrapSymbolicKey;
  const names = new Set([node.id, ...(typeof key === "string" && key ? [key] : [])]);
  return (flowInterface?.outputs ?? [])
    .filter((port) => outlineBindingPaths(port.metadata?.binding).some((path) => names.has(automationNodeOutputReference(path)?.key ?? "")))
    .map((port) => port.name || port.id);
}
