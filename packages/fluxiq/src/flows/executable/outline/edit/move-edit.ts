// Moving a step one place up or down inside its own block: the two steps swap
// places on the path, A -> first -> second -> B becoming A -> second -> first
// -> B, each edge keeping the ports it had at the end that stays. Only two
// plain steps that follow each other directly can swap, and never when the
// later one uses a value the earlier one gives.
import type { GraphPatchOperation } from "../../../../api-contracts/automation/index.ts";
import type { OutlinePathEdge } from "../graph/index.ts";
import type { OutlineEdit, OutlineEditResult, OutlineStep } from "../types/index.ts";
import type { OutlineEditContext } from "./edit-context.ts";
import { outlineGraphRecords } from "./graph-records.ts";
import { outlineStepPlace } from "./step-place.ts";
import { outlineUses } from "./uses.ts";

const MOVABLE: ReadonlySet<OutlineStep["kind"]> = new Set(["act", "data", "call", "step"]);

/** The patch that moves a step up or down. */
export function outlineMoveEdit(context: OutlineEditContext, edit: Extract<OutlineEdit, { kind: "move" }>): OutlineEditResult {
  const place = outlineStepPlace(context, edit.step);
  if (!place) return { ok: false, reason: `There is no step ${edit.step}.` };
  const other = place.block[edit.direction === "up" ? place.index - 1 : place.index + 1];
  if (!other) return { ok: false, reason: `Step ${edit.step} is already ${edit.direction === "up" ? "first" : "last"} in its part.` };
  const [first, second] = edit.direction === "up" ? [other, place.step] : [place.step, other];
  for (const step of [first, second]) {
    if (!MOVABLE.has(step.kind) || step.children?.length || step.arms?.length) return { ok: false, reason: `Step ${step.number} cannot be moved from here. Move it in the graph.` };
  }
  const earlier = context.nodes.get(first.nodeIds[0] ?? "");
  const later = context.nodes.get(second.nodeIds[0] ?? "");
  if (!earlier || !later) return { ok: false, reason: "These steps cannot be moved from here. Move them in the graph." };
  const into = context.paths.in.get(earlier.id) ?? [];
  const between = context.paths.out.get(earlier.id) ?? [];
  const after = context.paths.out.get(later.id) ?? [];
  const link = between[0];
  if (into.length !== 1 || between.length !== 1 || link?.target !== later.id || (context.paths.in.get(later.id) ?? []).length !== 1 || after.length > 1) {
    return { ok: false, reason: `Steps ${first.number} and ${second.number} do not follow each other directly. Move them in the graph.` };
  }
  const used = outlineUses(context.paths, later, earlier);
  if (used !== undefined) return { ok: false, reason: `Step ${second.number} uses “${used}”, which step ${first.number} gives, so it cannot go before it.` };
  return { ok: true, operations: swap(context, into[0]!, link, after[0]), message: `Moved step ${edit.step} ${edit.direction}` };
}

/** A -> earlier -> later -> B as A -> later -> earlier -> B. */
function swap(context: OutlineEditContext, into: OutlinePathEdge, link: OutlinePathEdge, after: OutlinePathEdge | undefined): GraphPatchOperation[] {
  const records = outlineGraphRecords(context.graph.flowId, [...context.graph.nodes.map((node) => node.id), ...context.graph.edges.map((edge) => edge.id)]);
  const a = into.edge.sourceNodeId;
  const earlier = link.edge.sourceNodeId;
  const later = link.edge.targetNodeId;
  const operations: GraphPatchOperation[] = [
    { op: "delete_edge", edgeId: into.edge.id },
    { op: "delete_edge", edgeId: link.edge.id },
    ...(after ? [{ op: "delete_edge" as const, edgeId: after.edge.id }] : []),
    records.addEdge({ sourceNodeId: a, sourcePortId: into.edge.sourcePortId, targetNodeId: later, targetPortId: link.edge.targetPortId }),
    records.addEdge({ sourceNodeId: later, sourcePortId: after?.edge.sourcePortId ?? link.edge.sourcePortId, targetNodeId: earlier, targetPortId: into.edge.targetPortId })
  ];
  if (after) operations.push(records.addEdge({ sourceNodeId: earlier, sourcePortId: link.edge.sourcePortId, targetNodeId: after.edge.targetNodeId, targetPortId: after.edge.targetPortId }));
  return operations;
}
