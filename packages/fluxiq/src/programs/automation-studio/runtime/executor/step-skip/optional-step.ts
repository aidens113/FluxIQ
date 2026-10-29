import type { AutomationStudioFlowDocument, AutomationStudioFlowEdge, AutomationStudioFlowNode } from "../../../model/index.ts";
import { chooseAutomationStudioEdge } from "../graph-navigation/index.ts";
import { automationStudioOptionalStepGuardedGroup } from "./guarded-group.ts";

/**
 * The way on past an optional step, or nothing when the node is not one.
 *
 * An optional step -- a popup, a banner, a consent prompt, a notice, a wait
 * marked `optional: yes` -- is only sometimes there to be done, so the run
 * going on past it is what the Flow says to do, not a recovery. It is the one
 * rule every execution path reads: the absent-step skip (`absent-step.ts`),
 * the recovery ladder's offer (`../recovery-ladder.ts`) and what the recovery
 * budgets count (`../recovery-budget.ts`), so a trial and a playback treat an
 * optional step the same way whatever stopped it (t371).
 *
 * **Optional** is either of:
 * - the optional shape a build writes: a `failed` edge into a Merge that the
 *   step's `success` path also reaches. The `success` edge either enters that
 *   Merge itself (a lone optional step) or runs a guarded group first -- the
 *   steps written `only after:` the optional one, such as a wait after a
 *   site's slow-down notice is closed -- through steps that do not branch
 *   (`flow-bootstrap/script-statements/guarded-steps.ts`, t378). The way on is
 *   that `failed` edge, straight to the join, past the guarded steps.
 * - `metadata.sometimesPresent === true`. The way on is that same `failed`
 *   edge when the step has the shape, else its `success` edge.
 */
export function automationStudioOptionalStepWayOn(flow: Pick<AutomationStudioFlowDocument, "nodes" | "edges">, node: AutomationStudioFlowNode): AutomationStudioFlowEdge | undefined {
  // The optional shape, its guarded group walked once for every reader (`./guarded-group.ts`).
  const failed = flow.edges.find((edge) => edge.sourceNodeId === node.id && edge.sourcePortId === "failed");
  if (failed && automationStudioOptionalStepGuardedGroup(flow, node)) return failed;
  if (node.metadata?.sometimesPresent === true) return chooseAutomationStudioEdge(flow, node.id, "success", node.definitionId) ?? undefined;
  return undefined;
}
