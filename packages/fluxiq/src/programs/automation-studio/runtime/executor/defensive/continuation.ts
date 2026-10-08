import type { AutomationStudioAdaptiveFailureClass } from "@fluxiq/contracts/automation-studio";
import type { JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../../model/index.ts";
import { getAutomationNodeDefinition, isAutomationNodeParameterStateBinding } from "../../../nodes/index.ts";
import { chooseAutomationStudioEdge } from "../graph-navigation.ts";
import type { AutomationStudioFaultAssessment } from "./contracts.ts";
import { automationStudioNodeMutates } from "./node-side-effect.ts";

/**
 * Whether a failure of this class leaves the rest of the Flow standing, class by
 * class.
 *
 * The line is whether the failure says *this step did not do its thing* or *the
 * world is not what the Flow assumed*. A step that did not run leaves everything
 * after it as valid as it was. A premise that turned out false does not: a Flow
 * that walks past a sign-in wall, a rejected expected state, a page that moved or
 * a gate that refused is running its remaining steps against something that is no
 * longer there, and it will report a confident wrong answer rather than a failure.
 *
 * `ambiguous_or_unknown` stops, and that is the one entry worth defending: nobody
 * knows what happened, so nobody can say the Flow's premise survived it. "We do not
 * know" is not a licence to carry on.
 *
 * A complete record rather than a list, so a class added to
 * `AUTOMATION_STUDIO_ADAPTIVE_FAILURE_CLASSES` is a compile error here until
 * somebody decides whether a Flow may walk past it.
 */
const SURVIVABLE: Readonly<Record<AutomationStudioAdaptiveFailureClass, boolean>> = Object.freeze({
  action_failed: true,
  timeout: true,
  target_not_found: true,
  target_ambiguous: true,
  expected_state_missing: false,
  unexpected_state: false,
  blocked_by_capability_or_policy: false,
  missing_router_or_subflow_target: false,
  graph_validation_or_unknown_node: false,
  external_side_effect_denied: false,
  ambiguous_or_unknown: false,
  navigation_unexpected: false,
  output_not_observed: false,
  page_changed: false,
  auth_required: false,
  user_intervention_required: false
});

/** Whether the Flow carries on past a node that failed for good, and the reason either way. */
export type AutomationStudioFailureContinuation = {
  continues: boolean;
  reason: string;
};

/** How deep a downstream node's parameter values are walked looking for a binding onto the failed node. */
const MAXIMUM_BINDING_DEPTH = 16;

/** The value an author writes to decide this themselves. */
const CONTINUE = "continue";
const STOP = "stop";

/**
 * Whether one node failing for good ends the run.
 *
 * The instruction this answers is blunt: there is no reason a Flow should stop
 * because one thing went wrong. But "carry on regardless" is not the same rule --
 * a Flow that walks past the step that logged in, or past the step whose rows were
 * the answer, produces a confident wrong result, which is worse than a failure.
 * So the Flow carries on unless carrying on would be wrong, and each way of being
 * wrong is named:
 *
 *  0. **The failure says the premise is gone.** `SURVIVABLE` above draws that line
 *     class by class, and a failure whose result was never confirmed is on the
 *     wrong side of it too: the node ran, what it did is unknown, and everything
 *     after it assumes it worked.
 *  1. **The author said so.** `onFailure: "stop"` or `"continue"` on the node, then
 *     on the Flow, decides it outright, and `optional: true` on the node means
 *     continue. Stopping *is* sometimes the instruction, and an author who wrote it
 *     is not overruled in either direction.
 *  2. **The node acted on the world.** A consequential act that then failed is not
 *     something to stroll past: what it did is unknown, and everything after it
 *     assumes it worked.
 *  3. **The node held the answer.** A node that captures records is producing what
 *     the run was asked for. Walking past it returns a run that succeeded and
 *     answered nothing.
 *  4. **Something downstream reads it.** A later node bound to this node's outputs,
 *     by a data edge or by a state binding, cannot run correctly without them. Where
 *     the outputs cannot even be enumerated -- a node with no registered definition
 *     -- that counts as depended upon, because guessing wrong here is guessing in
 *     the direction of a wrong answer.
 *  5. **There is nowhere to carry on to.** A node with no onward route was the last
 *     thing the Flow had to do, so its failure is the failure of the run.
 */
export function automationStudioContinuationAfterFailure(
  flow: AutomationStudioFlowDocument,
  node: AutomationStudioFlowNode,
  fault: AutomationStudioFaultAssessment | undefined
): AutomationStudioFailureContinuation {
  const authored = authoredChoice(node.parameterValues?.onFailure) ?? authoredChoice(node.metadata?.onFailure) ?? optionalChoice(node.metadata?.optional) ?? authoredChoice(flow.metadata?.onNodeFailure);
  if (authored === CONTINUE) return { continues: true, reason: `The Flow states that ${node.id} failing does not stop the run.` };
  if (authored === STOP) return { continues: false, reason: `The Flow states that ${node.id} failing stops the run.` };
  if (!fault) {
    return { continues: false, reason: `${node.id} failed for a reason nothing could classify, so nothing establishes that the rest of the Flow still stands.` };
  }
  if (fault.actUncertain) {
    return { continues: false, reason: `${node.id} made a lasting act that may already have taken effect and was not repeated, so its outcome is uncertain and the steps after it assume it worked.` };
  }
  if (!SURVIVABLE[fault.category]) {
    return { continues: false, reason: `${node.id} failed with ${fault.category}, which says the Flow is no longer standing where it assumed rather than that one step did not work.` };
  }
  if (fault.stage === "confirmation" || fault.stage === "verification") {
    return { continues: false, reason: `${node.id} ran and its result was never confirmed, so what it did is unknown and the steps after it assume it worked.` };
  }
  if (automationStudioNodeMutates(node)) {
    return { continues: false, reason: `${node.id} acts outside the run, so what it did before failing is unknown and the steps after it assume it worked.` };
  }
  if (carriesAnswer(node)) {
    return { continues: false, reason: `${node.id} captures the records the run was asked for, so carrying on would return a run that succeeded and answered nothing.` };
  }
  if (!chooseAutomationStudioEdge(flow, node.id, "success", node.definitionId)) {
    return { continues: false, reason: `${node.id} has no onward route, so it was the last thing the Flow had to do.` };
  }
  const outputIds = getAutomationNodeDefinition(node.definitionId)?.outputs.map((port) => port.id);
  if (!outputIds) {
    return { continues: false, reason: `${node.id} has no registered definition, so Core cannot enumerate what it produces and cannot tell whether the steps after it need it.` };
  }
  const dependent = dependentNodeId(flow, node, outputIds);
  if (dependent) {
    return { continues: false, reason: `${dependent} reads what ${node.id} produces, so carrying on would run it without the values it is bound to.` };
  }
  return { continues: true, reason: `Nothing after ${node.id} reads what it produces and it changed nothing outside the run, so its failure is reported and the Flow carries on.` };
}

function authoredChoice(value: JsonValue | undefined): string | undefined {
  return value === CONTINUE || value === STOP ? value : undefined;
}

function optionalChoice(value: JsonValue | undefined): string | undefined {
  return value === true ? CONTINUE : undefined;
}

/** A node whose rows are what the run was asked for: a written record output, or an output declaring one. */
function carriesAnswer(node: AutomationStudioFlowNode): boolean {
  if (node.definitionId === "builtin.data.write-records") return true;
  for (const declared of [node.parameterValues?.recordOutput, node.metadata?.recordOutput, node.metadata?.recordsPath]) {
    if (declared !== undefined && declared !== null) return true;
  }
  return false;
}

/**
 * The first node reachable from this one that reads what it produces, or nothing
 * when none does.
 *
 * Both ways a value travels are checked: a data edge, which names the output port
 * directly, and a state binding, which names `${nodeId}.${outputId}` or the bare
 * output id the run also keys values under.
 */
function dependentNodeId(flow: AutomationStudioFlowDocument, node: AutomationStudioFlowNode, outputIds: readonly string[]): string | undefined {
  for (const edge of flow.edges) {
    if (edge.sourceNodeId !== node.id || !edge.targetPortId || edge.targetPortId === "in") continue;
    return edge.targetNodeId;
  }
  const reachable = reachableFrom(flow, node.id);
  const paths = new Set<string>([node.id, ...outputIds, ...outputIds.map((outputId) => `${node.id}.${outputId}`)]);
  for (const candidate of flow.nodes) {
    if (candidate.id === node.id || !reachable.has(candidate.id)) continue;
    if (readsAnyPath(candidate.parameterValues ?? {}, paths, 0)) return candidate.id;
  }
  return undefined;
}

/** Every node the run could still reach from here, by any route. */
function reachableFrom(flow: AutomationStudioFlowDocument, nodeId: string): Set<string> {
  const reachable = new Set<string>();
  const pending = [nodeId];
  while (pending.length) {
    const current = pending.pop()!;
    for (const edge of flow.edges) {
      if (edge.sourceNodeId !== current || reachable.has(edge.targetNodeId)) continue;
      reachable.add(edge.targetNodeId);
      pending.push(edge.targetNodeId);
    }
  }
  return reachable;
}

/** Whether any state binding below this value names one of the paths the failed node writes. */
function readsAnyPath(value: JsonValue, paths: ReadonlySet<string>, depth: number): boolean {
  if (isAutomationNodeParameterStateBinding(value)) {
    const path = value.$state.path.trim();
    return paths.has(path) || [...paths].some((candidate) => path.startsWith(`${candidate}.`));
  }
  if (!value || typeof value !== "object" || depth >= MAXIMUM_BINDING_DEPTH) return false;
  const entries = Array.isArray(value) ? value : Object.values(value);
  return entries.some((entry) => readsAnyPath(entry, paths, depth + 1));
}
