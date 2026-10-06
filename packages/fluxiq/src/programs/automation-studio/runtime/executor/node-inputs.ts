import type { JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../model/index.ts";
import { automationNodeOutputReference, rewriteAutomationNodeStatePaths } from "../../nodes/index.ts";

/**
 * What a node sees when its parameters are resolved and its attempt is traced:
 * every value the run holds, with the values its edges bring on top under their
 * port names.
 */
export function collectNodeInputs(flow: AutomationStudioFlowDocument, node: AutomationStudioFlowNode, values: Record<string, JsonValue>): Record<string, JsonValue> {
  return { ...values, ...collectWiredNodeInputs(flow, node, values) };
}

/**
 * Only the values an edge brings to one of the node's ports.
 *
 * What a native implementation is handed. The merged view above also carries
 * every output under its bare port name (`graph-run.ts` keeps both), so a node
 * after a For Each that declares an `item` input received the loop's last row
 * although no edge gave it one -- and a web step that scopes its target to
 * `item` would have acted on that row (lane t195, worker t195-w4's probe).
 */
export function collectWiredNodeInputs(flow: AutomationStudioFlowDocument, node: AutomationStudioFlowNode, values: Record<string, JsonValue>): Record<string, JsonValue> {
  const inputs: Record<string, JsonValue> = {};
  for (const edge of flow.edges.filter((candidate) => candidate.targetNodeId === node.id)) {
    if (!edge.targetPortId || edge.targetPortId === "in") continue;
    const sourceKey = edge.sourcePortId ? `${edge.sourceNodeId}.${edge.sourcePortId}` : edge.sourceNodeId;
    if (values[sourceKey] !== undefined) inputs[edge.targetPortId] = values[sourceKey];
  }
  return inputs;
}

// A node's parameters reading another node's output, by that node's key in
// its graph (P5, t270).
//
// A step built from a draft may read an output of a step before it. The draft
// names that step by its own id; assembly, which numbers the plan's nodes
// `s1`, `s2`, ..., names it by its key: `{"$state":{"path":"$node.s3.value"}}`
// (`../flow-bootstrap/authoring/assemble-draft.ts`). Which id the node is given
// in the stored Flow is decided later -- minted for a creation, kept for an
// extend -- and every node a build writes carries its key as
// `metadata.bootstrapSymbolicKey` (`../flow-bootstrap/adaptation.ts`). So the
// key is resolved here, when the reading node runs, to the id the run keeps
// outputs under (`${nodeId}.${outputId}`, `./graph-run.ts`), and the
// resolver the executor already uses reads it (`../../nodes/parameter-bindings.ts`).
//
// **Nothing is made up.** A key no node of this graph carries, or more than
// one carries, is left as it was, and the resolver reports it missing: the
// node fails `executor.parameter.unresolved_state_path` before it runs. So
// does a key whose node has not produced that output in this run.

/** Where a node a build wrote keeps its key in the plan it was assembled from. */
const SYMBOLIC_KEY_METADATA = "bootstrapSymbolicKey";

/** The parameters with every node-output reference naming the node's id in this graph (see above). */
export function automationStudioNodeOutputReferences(flow: AutomationStudioFlowDocument, parameterValues: Record<string, JsonValue>): Record<string, JsonValue> {
  let ids: Map<string, string | null> | undefined;
  return rewriteAutomationNodeStatePaths(parameterValues, (path) => {
    const reference = automationNodeOutputReference(path);
    if (!reference) return undefined;
    ids ??= idsByKey(flow);
    const id = ids.get(reference.key);
    return id ? `${id}.${reference.rest}` : undefined;
  });
}

/** Each key a node of the graph carries, with its node's id; `null` for a key more than one carries. */
function idsByKey(flow: AutomationStudioFlowDocument): Map<string, string | null> {
  const ids = new Map<string, string | null>();
  for (const node of flow.nodes) {
    const key = node.metadata?.[SYMBOLIC_KEY_METADATA];
    if (typeof key !== "string" || !key) continue;
    ids.set(key, ids.has(key) ? null : node.id);
  }
  return ids;
}
