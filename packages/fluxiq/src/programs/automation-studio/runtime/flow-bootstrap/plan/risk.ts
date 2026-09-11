// The risk band a validated plan carries, derived from the safety and
// capability declarations of the node definitions it selects.
import type { AutomationStudioNodeRegistry, AutomationStudioNodeRegistryResolution } from "../../../nodes/index.ts";
import type { AutomationStudioFlowBootstrapPlan, AutomationStudioFlowBootstrapRisk } from "./contracts.ts";

export function deriveRisk(plan: AutomationStudioFlowBootstrapPlan, registry: AutomationStudioNodeRegistry, resolution: AutomationStudioNodeRegistryResolution): AutomationStudioFlowBootstrapRisk {
  let risk: AutomationStudioFlowBootstrapRisk = plan.subflows.length > 3 ? "medium" : "low";
  for (const subflow of plan.subflows) for (const node of subflow.nodes) {
    const definition = registry.get(node.definitionId, resolution);
    if (!definition) continue;
    const runtime = definition.safety?.runtime;
    if (definition.safety?.privileged || definition.safety?.requiresOperatorApproval || runtime?.process || runtime?.childProcess || runtime?.filesystemRoots?.length) return "high";
    if (definition.outputAction || definition.requiredRuntimeCapabilities?.length || definition.safety?.requiredPermissions?.length || runtime?.networkDestinations?.length || runtime?.secretHandles?.length) risk = "medium";
  }
  return risk;
}
