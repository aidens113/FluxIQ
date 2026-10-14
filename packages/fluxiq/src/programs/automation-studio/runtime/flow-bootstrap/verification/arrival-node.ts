// The arrival at the build's start location as one plan step (t578, t593): the
// domain's arrival node (`runsNodes.arrival`) with the start location under
// the parameter it takes one by. A partial trial's throwaway root opens with
// it (`./detached-subflow.ts`), and so does the Flow a project build assembles
// (`../../project-agents/supervisor/assembly.ts`), so a run of either starts on
// a loaded start page rather than on the page the last run left. One builder
// for both, so the two never write the arrival differently.
//
// It declares no lasting consequence (`[]`): it only loads a page. A domain
// node's output action is its command (the web domain's navigation declares a
// fixed one), derived exactly as a written step's is (`derivedOutputActionId`).
// Null when the registry offers no such node here, or the node declares an
// output action whose id cannot be derived: the caller refuses rather than
// run without its arrival.

import { AutomationStudioNodeRegistry, type AutomationStudioNodeRegistryResolution } from "../../../nodes/index.ts";
import { derivedOutputActionId } from "../authoring/index.ts";
import type { AutomationStudioFlowBootstrapNode } from "../plan/index.ts";

/** The arrival step's key in the subflow it opens. */
export const AUTOMATION_STUDIO_ARRIVAL_STEP_KEY = "arrival";

/** The arrival step (header), or null when the registry cannot give it. */
export function automationStudioArrivalPlanNode(
  arrival: { node: string; parameter: string; location: string },
  registry: AutomationStudioNodeRegistry | undefined,
  resolution: AutomationStudioNodeRegistryResolution
): AutomationStudioFlowBootstrapNode | null {
  const definition = (registry ?? new AutomationStudioNodeRegistry()).get(arrival.node, resolution);
  if (!definition) return null;
  const outputActionId = derivedOutputActionId(definition);
  if (definition.outputAction && !outputActionId) return null;
  return {
    key: AUTOMATION_STUDIO_ARRIVAL_STEP_KEY,
    definitionId: definition.id,
    definitionVersion: definition.version,
    parameters: { [arrival.parameter]: arrival.location },
    ...(outputActionId ? { outputActionId } : {}),
    consequences: []
  };
}
