// What the Flow a build wrote does about where it starts, read off the plan.
//
// Two questions, and both are answered from what the plan names rather than
// from what any step means:
//
//   - which steps act on the bound domain's own target. A node the domain
//     registered is one of them by definition -- that is what a domain node is
//     -- and so is one of Core's own nodes that has been told to dispatch a
//     domain output, which it says by naming that output in the parameter its
//     definition marks as a reference to an action. Core's other nodes touch
//     nothing outside the run, so a Flow made only of those has no target to
//     arrive at and is not asked to;
//   - which steps carry where the Flow starts. Core never parses a start
//     location (`../start-location.ts`): the spelling belongs to the domain, so
//     this compares text and nothing else.
//
// The comparison is deliberately loose, and it is one reading shared with the
// completion's arrival restore (`./location-agreement.ts`).
import type { AutomationStudioNodeDefinition, AutomationStudioNodeRegistry, AutomationStudioNodeRegistryResolution } from "../../../nodes/index.ts";
import type { AutomationStudioFlowBootstrapNode, AutomationStudioFlowBootstrapPlan } from "../plan/index.ts";
import type { AutomationStudioFlowBootstrapPlanLocations } from "./contracts.ts";
import { automationStudioFlowBootstrapValuesCarryLocation } from "./location-agreement.ts";

export function automationStudioFlowBootstrapPlanLocations(input: {
  plan: AutomationStudioFlowBootstrapPlan;
  registry: AutomationStudioNodeRegistry;
  resolution: AutomationStudioNodeRegistryResolution;
  /** Where the Flow starts, in the bound domain's own spelling. */
  startLocation: string;
}): AutomationStudioFlowBootstrapPlanLocations {
  const acting: string[] = [];
  const reaching: string[] = [];
  const steps: string[] = [];
  for (const subflow of input.plan.subflows) {
    for (const node of subflow.nodes) {
      steps.push(node.definitionId);
      // A definition the resolution does not offer refuses the plan in
      // validation under its own code; it is not this check's to answer.
      const definition = input.registry.get(node.definitionId, input.resolution);
      if (!definition) continue;
      if (actsOnTheTarget(definition, node)) acting.push(node.key);
      if (automationStudioFlowBootstrapValuesCarryLocation(node.parameters, input.startLocation)) reaching.push(node.key);
    }
  }
  return { acting, reaching, steps };
}

/** A node the bound domain registered, or one of Core's told to dispatch a domain output. */
function actsOnTheTarget(definition: AutomationStudioNodeDefinition, node: AutomationStudioFlowBootstrapNode): boolean {
  if (definition.availability.kind === "domain") return true;
  const reference = definition.parameters.find((candidate) => candidate.ui?.control === "reference" && candidate.ui.referenceType === "action");
  const named = reference ? node.parameters?.[reference.id] : undefined;
  return typeof named === "string" && named.trim().length > 0;
}
