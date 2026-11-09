// The recovery chain of a step (lane C W10/W11): the steps its `failed` edge
// runs before they rejoin, at a Merge, the line its `success` edge goes
// straight on to. It is the optional shape's mirror (`./guarded-group.ts`): a
// build writes it for a draft step that says `on_failed`
// (`../../../runtime/flow-authoring/bootstrap/authoring/draft-routing.ts`), and
// the recovery "runs when the step it recovers fails and at no other time". So
// on a pass where the step succeeded and went on into the join, the run owed
// those steps nothing, and graph navigation does not count them as left behind
// (`../graph-navigation/navigation.ts`).
import type { AutomationStudioFlowDocument } from "../../../flows/executable/graph/index.ts";
import type { AutomationStudioFlowNode } from "../../../flows/executable/graph/index.ts";
import { chooseAutomationStudioEdge } from "../graph-navigation/edge.ts";

/** The node a build joins a recovered step's two ways out at. */
const MERGE_DEFINITION_ID = "builtin.control.merge";

/**
 * The most steps a recovery chain may run before it reaches the join. A
 * recovery is a step or two; the bound keeps the walk finite on any graph, a
 * cycle or a long chain included. The same bound as a guarded group's.
 */
const MAX_RECOVERY_STEPS = 32;

/**
 * The node's join and the steps its failure path runs before it, in order, or
 * nothing when the node has not the recovery shape: a `success` edge straight
 * into a Merge, and a `failed` edge into at least one step, which reaches that
 * same Merge through steps that do not branch -- each has a `success` way on
 * and no `failed` route of its own -- within `MAX_RECOVERY_STEPS` steps, none
 * revisited. A `failed` edge straight into the Merge is the optional shape,
 * not a recovery, and is nothing here.
 */
export function automationStudioStepRecoveryChain(flow: Pick<AutomationStudioFlowDocument, "nodes" | "edges">, node: AutomationStudioFlowNode): { join: string; steps: string[] } | undefined {
  const success = chooseAutomationStudioEdge(flow, node.id, "success", node.definitionId);
  const failed = flow.edges.find((edge) => edge.sourceNodeId === node.id && edge.sourcePortId === "failed");
  if (!failed || !success || flow.nodes.find((candidate) => candidate.id === success.targetNodeId)?.definitionId !== MERGE_DEFINITION_ID) return undefined;
  const join = success.targetNodeId;
  const steps: string[] = [];
  let at = failed.targetNodeId;
  for (let count = 0; count <= MAX_RECOVERY_STEPS; count += 1) {
    if (at === join) return steps.length ? { join, steps } : undefined;
    if (at === node.id || steps.includes(at)) return undefined;
    const step = flow.nodes.find((candidate) => candidate.id === at);
    if (!step || flow.edges.some((edge) => edge.sourceNodeId === at && edge.sourcePortId === "failed")) return undefined;
    steps.push(at);
    const next = chooseAutomationStudioEdge(flow, at, "success", step.definitionId);
    if (!next) return undefined;
    at = next.targetNodeId;
  }
  return undefined;
}
