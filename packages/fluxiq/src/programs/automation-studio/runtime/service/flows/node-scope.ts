import type { AutomationStudioFlowScope } from "../../../model/index.ts";
import type { AutomationStudioNodeDefinition } from "../../../nodes/index.ts";

// Whether a registered node definition is available inside a Flow's scope.

export function nodeDefinitionScopeAllows(definition: AutomationStudioNodeDefinition, scope: AutomationStudioFlowScope): boolean {
  return definition.availability.kind === "both"
    || (definition.availability.kind === "global" && scope.kind === "global")
    || (definition.availability.kind === "domain" && scope.kind === "domain" && definition.availability.domainId === scope.domainId);
}
