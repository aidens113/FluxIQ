// How many engine steps a saved Flow's run may take. The engine's own default (`graph-run.ts`) is
// fixed, and a retry counts as a step, so a long Flow its size setting let assemble would trip it
// on every attempt and never run whole: it would explore each time, which is what keeping the Flow
// is meant to end. So the bound follows the Flow, at a node's first try and its three retries. A
// repeat raises it for itself as it goes. Reaching it still only ends the run, never the attempt.

import type { AutomationStudioFlowBuildPlan } from "../../../../../runtime/flow-authoring/bootstrap/plan/index.ts";

/** The engine's default, kept as the floor: a short Flow runs as any other run does. */
const DEFAULT_STEPS = 250;
/** A node's first try and its three retries (`engine/automation/retry-policy.ts`). */
const TRIES_PER_NODE = 4;

export function automationStudioAnswerFirstFlowRunStepBound(buildPlan: AutomationStudioFlowBuildPlan): number {
  const nodes = buildPlan.plan.subflows.reduce((total, subflow) => total + subflow.nodes.length, 0);
  return Math.max(DEFAULT_STEPS, nodes * TRIES_PER_NODE);
}
