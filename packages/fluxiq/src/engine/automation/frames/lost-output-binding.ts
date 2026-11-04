// A Subflow's declared output that names a node by its key
// (`metadata.binding`, `{"$state":{"path":"$node.s2.text"}}`) is read from the
// node of its graph that carries that key as `metadata.bootstrapSymbolicKey`.
// A graph in which no node carries the key has lost the binding: nothing it
// runs can ever answer it.

import { isAutomationNodeParameterStateBinding, automationNodeOutputReference } from "../../../components/automation/index.ts";
import type { AutomationStudioFlowDocument } from "../../../flows/executable/graph/index.ts";

/** A declared output port, as far as its binding is concerned. */
export type AutomationStudioDeclaredOutputPort = { id: string; metadata?: Record<string, unknown> };

/** A declared output whose binding names a key no node of the graph carries. */
export type AutomationStudioLostOutputBinding = { portId: string; key: string };

/** The first declared output whose binding names a node key that no node of `graph` carries, or nothing. */
export function automationStudioLostOutputBinding(graph: Pick<AutomationStudioFlowDocument, "nodes">, outputs: readonly AutomationStudioDeclaredOutputPort[] | undefined): AutomationStudioLostOutputBinding | undefined {
  const carried = new Set(graph.nodes.flatMap((node) => (typeof node.metadata?.bootstrapSymbolicKey === "string" ? [node.metadata.bootstrapSymbolicKey] : [])));
  for (const port of outputs ?? []) {
    const binding = port.metadata?.binding;
    if (!isAutomationNodeParameterStateBinding(binding)) continue;
    const reference = automationNodeOutputReference(binding.$state.path);
    if (reference && !carried.has(reference.key)) return { portId: port.id, key: reference.key };
  }
  return undefined;
}
