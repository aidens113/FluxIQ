// Deleting a step: its node goes (the store removes its edges with it), with
// the nodes that only gave it a value, and one edge joins the step before it to
// the step after, keeping the ports each end had. Structural nodes the step
// was attributed (a start, a merge) stay. A step that holds other steps, that
// is the only source of one of the Flow's outputs, or whose value a later step
// uses, is not deleted.
import type { GraphPatchOperation } from "../../../../api-contracts/automation/index.ts";
import { outlineNodeRole } from "../graph/index.ts";
import type { OutlineEdit, OutlineEditResult, OutlineStep } from "../types/index.ts";
import type { OutlineEditContext } from "./edit-context.ts";
import { outlineGraphRecords } from "./graph-records.ts";
import { outlineOutputsFrom } from "./output-source.ts";
import { outlineStepPlace } from "./step-place.ts";
import { outlineUses } from "./uses.ts";

const DELETABLE: ReadonlySet<OutlineStep["kind"]> = new Set(["act", "data", "call", "step"]);

/** The patch that deletes a step. */
export function outlineDeleteEdit(context: OutlineEditContext, edit: Extract<OutlineEdit, { kind: "delete" }>): OutlineEditResult {
  const place = outlineStepPlace(context, edit.step);
  if (!place) return { ok: false, reason: `There is no step ${edit.step}.` };
  const { step, node } = place;
  if (!node || !DELETABLE.has(step.kind)) return { ok: false, reason: `Step ${edit.step} cannot be deleted from here. Delete it in the graph.` };
  if (step.children?.length || step.arms?.length) return { ok: false, reason: `Step ${edit.step} holds other steps. Delete those first, or delete it in the graph.` };
  const outputs = outlineOutputsFrom(context.graph.interface ?? undefined, node);
  if (outputs.length) return { ok: false, reason: `Step ${edit.step} is where “${outputs[0]}” comes from, so it cannot be deleted.` };
  for (const other of context.graph.nodes) {
    if (other.id === node.id) continue;
    const used = outlineUses(context.paths, other, node);
    if (used !== undefined) return { ok: false, reason: `${stepOf(context, other.id) ?? "Another step"} uses “${used}”, which step ${edit.step} gives, so step ${edit.step} cannot be deleted.` };
  }
  const into = context.paths.in.get(node.id) ?? [];
  const out = context.paths.out.get(node.id) ?? [];
  if (into.length > 1 || out.length > 1) return { ok: false, reason: `Step ${edit.step} joins several paths. Delete it in the graph.` };
  const feeders = step.nodeIds.filter((id) => id !== node.id && onlyFeeds(context, id, new Set(step.nodeIds)));
  const records = outlineGraphRecords(context.graph.flowId, [...context.graph.nodes.map((candidate) => candidate.id), ...context.graph.edges.map((edge) => edge.id)]);
  const operations = [node.id, ...feeders].map((nodeId): GraphPatchOperation => ({ op: "delete_node", nodeId }));
  const before = into[0];
  const after = out[0];
  if (before && after) operations.push(records.addEdge({ sourceNodeId: before.edge.sourceNodeId, sourcePortId: before.edge.sourcePortId, targetNodeId: after.edge.targetNodeId, targetPortId: after.edge.targetPortId }));
  return { ok: true, operations, message: `Deleted step ${edit.step}` };
}

/** A node of the step that only gives values to the step's own nodes: it goes with the step. */
function onlyFeeds(context: OutlineEditContext, nodeId: string, stepNodes: ReadonlySet<string>): boolean {
  const node = context.nodes.get(nodeId);
  if (!node || ["start", "end", "merge", "noop"].includes(outlineNodeRole(node))) return false;
  if (context.paths.in.get(nodeId)?.length || context.paths.out.get(nodeId)?.length) return false;
  const given = context.paths.values.filter((edge) => edge.sourceNodeId === nodeId);
  return given.length > 0 && given.every((edge) => stepNodes.has(edge.targetNodeId));
}

/** "Step 5", for the step that holds a node. */
function stepOf(context: OutlineEditContext, nodeId: string): string | undefined {
  const search = (steps: readonly OutlineStep[]): string | undefined => {
    for (const step of steps) {
      if (step.number && step.nodeIds.includes(nodeId)) return `Step ${step.number}`;
      const inner = search([...(step.children ?? []), ...(step.arms ?? []).flatMap((arm) => arm.steps)]);
      if (inner) return inner;
    }
    return undefined;
  };
  return search(context.outline.steps);
}
