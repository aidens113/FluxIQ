import type { JsonObject } from "../../../../../core/index.ts";
import { resolveAutomationStudioNodeActionEffect, type AutomationStudioResolvedActionEffect } from "../../../nodes/action-effect/index.ts";
import type { AutomationStudioPlanActionEffectSource } from "./source.ts";

/** Resolve before parameter rewriting can discard an unresolved predicate slot. */
export function resolveAutomationStudioPlanActionEffect(
  source: AutomationStudioPlanActionEffectSource,
  node: { key: string; definitionId: string; definitionVersion: string },
  parameters: JsonObject
): AutomationStudioResolvedActionEffect | undefined {
  const definition = source.registry?.get(node.definitionId);
  if (definition) return resolveAutomationStudioNodeActionEffect(definition, parameters);
  return source.resolveActionEffect?.({ id: node.key, definitionId: node.definitionId, definitionVersion: node.definitionVersion, parameterValues: parameters }, parameters);
}
