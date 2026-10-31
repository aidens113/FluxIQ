// Whether a part of a plan already has a handler waiting for a layer (P6, t799):
// a registration whose `when` asks the `obstruction` or the `dialog` fact about
// the layer's name. Either fact answers the same question (I3), so a handler
// written in the old words still stands in for the new.

import { AUTOMATION_STUDIO_FLOW_BOOTSTRAP_STATE_NODE_IDS, type AutomationStudioFlowBootstrapSubflow } from "../plan/index.ts";

/** The facts a layer is waited for by. */
const LAYER_FACTS: ReadonlySet<string> = new Set(["obstruction", "dialog"]);

/** Whether a handler of `subflow` waits, by either fact, for the layer named `layer.name` (header). */
export function subflowWaitsForLayer(subflow: AutomationStudioFlowBootstrapSubflow, layer: { name: string }): boolean {
  return subflow.nodes.some((node) => {
    if (node.definitionId !== AUTOMATION_STUDIO_FLOW_BOOTSTRAP_STATE_NODE_IDS.handler) return false;
    const when = node.parameters?.when;
    return Array.isArray(when) && when.some((condition) => typeof condition === "object" && condition !== null && !Array.isArray(condition)
      && typeof condition.fact === "string" && LAYER_FACTS.has(condition.fact) && condition.value === layer.name);
  });
}
