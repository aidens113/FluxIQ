// Adding a step: a "Run another Flow" step (a Call Flow node naming the Flow
// by id) or a data step from the short menu (a data step node carrying its
// declaration), spliced into the path after a step, or first when no step is
// named. The edge it is spliced into is the step's way on when it works, a
// loop's way on once it is done; a step with several ways on takes no step
// straight after it.
import type { GraphPatchOperation } from "../../../../api-contracts/automation/index.ts";
import { PIPELINE_NODE_TYPES } from "../../../../framework/automation-service/service/pipelines/compile/index.ts";
import type { AutomationStudioFlowNode } from "../../graph/index.ts";
import { outlineNodeRole, type OutlinePathEdge } from "../graph/index.ts";
import type { OutlineEdit, OutlineEditResult } from "../types/index.ts";
import { outlineDataWords } from "../words/index.ts";
import type { OutlineEditContext } from "./edit-context.ts";
import { outlineGraphRecords, type OutlineNewNode } from "./graph-records.ts";
import { outlineStepPlace } from "./step-place.ts";

const MENU: ReadonlySet<string> = new Set(["filter", "sort", "limit", "dedupe", "sink"]);
const FAILURE_PORTS: ReadonlySet<string> = new Set(["failed", "failure"]);

/** The patch that adds a step. */
export function outlineInsertEdit(context: OutlineEditContext, edit: Extract<OutlineEdit, { kind: "add-call" | "add-data" }>): OutlineEditResult {
  if (edit.kind === "add-data" && !MENU.has(edit.data.kind)) return { ok: false, reason: "That kind of data step cannot be added here." };
  if (edit.kind === "add-call" && !edit.flow.flowId.trim()) return { ok: false, reason: "Choose the Flow to run." };
  const anchor = anchorOf(context, edit.after);
  if (typeof anchor === "string") return { ok: false, reason: anchor };
  const records = outlineGraphRecords(context.graph.flowId, [...context.graph.nodes.map((node) => node.id), ...context.graph.edges.map((edge) => edge.id)]);
  const nodeId = edit.nodeId && !context.nodes.has(edit.nodeId) ? edit.nodeId : records.mint("outline-step");
  const near = anchor.node?.position;
  const added: OutlineNewNode = edit.kind === "add-call"
    ? { nodeId, definitionId: PIPELINE_NODE_TYPES.callFlow, label: edit.flow.name, parameterValues: { target: { flowId: edit.flow.flowId } }, ...(near ? { near } : {}) }
    : { nodeId, definitionId: PIPELINE_NODE_TYPES.step, label: "", parameterValues: { step: edit.data }, ...(near ? { near } : {}) };
  if (edit.kind === "add-data") added.label = outlineDataWords({ id: nodeId, definitionId: added.definitionId, parameterValues: added.parameterValues }) ?? "Data step";
  const operations: GraphPatchOperation[] = [records.addNode(added)];
  const way = anchor.way;
  if (way) {
    operations.push({ op: "delete_edge", edgeId: way.edge.id });
    operations.push(records.addEdge({ sourceNodeId: way.edge.sourceNodeId, sourcePortId: way.edge.sourcePortId, targetNodeId: nodeId }));
    operations.push(records.addEdge({ sourceNodeId: nodeId, targetNodeId: way.target, targetPortId: way.edge.targetPortId }));
  } else if (anchor.node) operations.push(records.addEdge({ sourceNodeId: anchor.node.id, sourcePortId: anchor.port, targetNodeId: nodeId }));
  else if (anchor.before) operations.push(records.addEdge({ sourceNodeId: nodeId, targetNodeId: anchor.before }));
  const where = edit.after ? `after step ${edit.after}` : "first";
  return { ok: true, operations, message: `Added a step ${where}: ${edit.kind === "add-call" ? `Run Flow ▸ ${edit.flow.name}` : added.label}` };
}

/** Where the new step goes: the edge it splits, else the node it follows, else the entry it comes before; or why it cannot go there. */
type Anchor = { node?: AutomationStudioFlowNode; way?: OutlinePathEdge; port?: string; before?: string };

function anchorOf(context: OutlineEditContext, after: string | undefined): Anchor | string {
  if (after === undefined) {
    const start = context.graph.nodes.find((node) => outlineNodeRole(node) === "start");
    if (start) return wayOut(context, start, undefined);
    const entry = context.graph.nodes.find((node) => !context.paths.in.get(node.id)?.length && (context.paths.out.get(node.id)?.length ?? 0) > 0);
    return entry ? { before: entry.id } : {};
  }
  const place = outlineStepPlace(context, after);
  if (!place) return `There is no step ${after}.`;
  const { step, node } = place;
  if (!node || step.kind === "give-back" || step.kind === "end" || step.kind === "handler-end") return `Nothing can be added after step ${after}.`;
  if (step.kind === "branch" || step.kind === "switch" || step.arms?.length) return `Step ${after} has more than one way on. Add the step inside one of them, or after the step that follows.`;
  return wayOut(context, node, step.kind === "loop" ? "done" : undefined);
}

/** The node's way on (its `port`, else its one way on when it works). */
function wayOut(context: OutlineEditContext, node: AutomationStudioFlowNode, port: string | undefined): Anchor | string {
  const ways = (context.paths.out.get(node.id) ?? []).filter((edge) => (port ? edge.port === port : !FAILURE_PORTS.has(edge.port) && !edge.port.startsWith("error.")));
  if (ways.length > 1) return "That step has more than one way on. Add the step in the graph.";
  return ways[0] ? { node, way: ways[0] } : { node, ...(port ? { port } : {}) };
}
