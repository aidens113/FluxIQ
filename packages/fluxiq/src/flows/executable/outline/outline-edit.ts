// An edit made on the outline as the graph patch that makes it, so the editor
// and the assistant build identical patches (panel design, "Edits and the APIs
// they use"). The operations are the graph store's (`GraphPatchOperation`);
// the caller sends them as one `apply-graph-patch` with its base revision, a
// fresh mutation id and the message. An edit that cannot be made is answered
// with the reason, in words a person reads, never thrown.
import type { ExecutableGraph } from "../graph/index.ts";
import type { AutomationStudioFlowInterface } from "../interface/index.ts";
import { outlineDeleteEdit, outlineInsertEdit, outlineMoveEdit, outlineValueEdit, type OutlineEditContext } from "./edit/index.ts";
import { outlinePathGraph } from "./graph/index.ts";
import type { FlowOutline, OutlineEdit, OutlineEditResult } from "./types/index.ts";

/** The patch for one edit of `outline`, which was made from `graph`. */
export function outlineEdit(outline: FlowOutline, graph: Pick<ExecutableGraph, "flowId" | "nodes" | "edges"> & { interface?: AutomationStudioFlowInterface }, edit: OutlineEdit): OutlineEditResult {
  const context: OutlineEditContext = { outline, graph, nodes: new Map(graph.nodes.map((node) => [node.id, node])), paths: outlinePathGraph(graph) };
  switch (edit.kind) {
    case "set-value":
    case "bind-input":
    case "set-words":
      return outlineValueEdit(context, edit);
    case "move":
      return outlineMoveEdit(context, edit);
    case "delete":
      return outlineDeleteEdit(context, edit);
    default:
      return outlineInsertEdit(context, edit);
  }
}
