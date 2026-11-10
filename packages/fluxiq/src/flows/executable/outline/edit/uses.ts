// Whether one step uses a value another gives, and by what name, so an edit
// that would put the user before the giver, or remove the giver, is refused.
import { automationNodeOutputReference } from "../../../../components/automation/index.ts";
import type { AutomationStudioFlowNode } from "../../graph/index.ts";
import { outlineBindingPaths, type OutlinePathGraph } from "../graph/index.ts";

/** Where a build keeps a node's key in the plan it was assembled from (`$node.<key>...` names it). */
const SYMBOLIC_KEY = "bootstrapSymbolicKey";

/**
 * The name of what `user` takes from `giver`: a value edge between them, a
 * binding to one of the giver's outputs (`$node.<id or key>.<output>`), or a
 * saved value the giver sets and the user reads. Nothing when it takes none.
 */
export function outlineUses(paths: OutlinePathGraph, user: AutomationStudioFlowNode, giver: AutomationStudioFlowNode): string | undefined {
  const edge = paths.values.find((candidate) => candidate.sourceNodeId === giver.id && candidate.targetNodeId === user.id);
  if (edge) return edge.sourcePortId ?? "its result";
  const key = giver.metadata?.[SYMBOLIC_KEY];
  const names = new Set([giver.id, ...(typeof key === "string" && key ? [key] : [])]);
  const saved = giver.definitionId === "builtin.data.set-variable" && typeof giver.parameterValues?.name === "string" ? giver.parameterValues.name : undefined;
  for (const path of outlineBindingPaths(user.parameterValues)) {
    const reference = automationNodeOutputReference(path);
    if (reference && names.has(reference.key)) return reference.rest.split(".")[0];
    if (saved && path.split(".")[0] === saved) return saved;
  }
  return saved && user.definitionId === "builtin.data.get-variable" && user.parameterValues?.name === saved ? saved : undefined;
}
