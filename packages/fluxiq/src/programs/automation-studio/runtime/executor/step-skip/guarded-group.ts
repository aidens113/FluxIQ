// The guarded group of an optional step (t378, read for the per-pass act
// ledger by t796): the steps its `success` path runs before it reaches the
// join (a Merge) its `failed` edge goes straight to. They are the steps a
// script wrote `only after:` the optional one
// (`../../flow-bootstrap/script-statements/guarded-steps.ts`), and the run goes
// past every one of them on a pass where the optional step was skipped.
//
// One walk, read by the optional-step rule (`./optional-step.ts`: a step is
// optional by this shape) and by what a trial says of a step a guard went past
// (`../../service/candidate-trial/act-ledger.ts`), so both see the same group.
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../../model/index.ts";
import { chooseAutomationStudioEdge } from "../graph-navigation/index.ts";

/** The node a build joins an optional step's two ways out at (`flow-bootstrap/authoring/draft-routing.ts`). */
const MERGE_DEFINITION_ID = "builtin.control.merge";

/**
 * The most steps a guarded group's success path may run before it reaches the
 * join. A guarded group is a handful of steps (a wait, an acknowledgement); the
 * bound keeps the walk finite on any graph, a cycle or a long chain included.
 */
const MAX_GUARDED_STEPS = 32;

/**
 * The node's join and the steps its success path runs before it, in order
 * (`[]` for a lone optional step), or nothing when the node has not the
 * optional shape: a `failed` edge into a Merge that its `success` path reaches
 * through steps that do not branch -- each has a `success` way on and no
 * `failed` route of its own -- within `MAX_GUARDED_STEPS` steps, none revisited.
 */
export function automationStudioOptionalStepGuardedGroup(flow: Pick<AutomationStudioFlowDocument, "nodes" | "edges">, node: AutomationStudioFlowNode): { join: string; steps: string[] } | undefined {
  const success = chooseAutomationStudioEdge(flow, node.id, "success", node.definitionId);
  const failed = flow.edges.find((edge) => edge.sourceNodeId === node.id && edge.sourcePortId === "failed");
  if (!failed || !success || flow.nodes.find((candidate) => candidate.id === failed.targetNodeId)?.definitionId !== MERGE_DEFINITION_ID) return undefined;
  const join = failed.targetNodeId;
  const steps: string[] = [];
  let at = success.targetNodeId;
  for (let count = 0; count <= MAX_GUARDED_STEPS; count += 1) {
    if (at === join) return { join, steps };
    if (steps.includes(at)) return undefined;
    const step = flow.nodes.find((candidate) => candidate.id === at);
    if (!step || flow.edges.some((edge) => edge.sourceNodeId === at && edge.sourcePortId === "failed")) return undefined;
    steps.push(at);
    const next = chooseAutomationStudioEdge(flow, at, "success", step.definitionId);
    if (!next) return undefined;
    at = next.targetNodeId;
  }
  return undefined;
}
