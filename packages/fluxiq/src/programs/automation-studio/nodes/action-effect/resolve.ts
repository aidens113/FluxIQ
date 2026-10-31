import type { AutomationStudioNodeDefinition } from "../definitions.ts";
import { readAutomationStudioResolvedActionEffect } from "./read-resolved.ts";
import type { AutomationStudioResolvedActionEffect } from "./resolved.ts";

/**
 * Resolves only a trusted canonical definition's floor, never node metadata.
 * Keep an unresolved parameter present: dropping a binding before this call
 * would mistake it for an absent value to which a schema default applies.
 */
export function resolveAutomationStudioNodeActionEffect(
  definition: Pick<AutomationStudioNodeDefinition, "actionEffect" | "parameters">,
  parameterValues: Readonly<Record<string, unknown>> = {}
): AutomationStudioResolvedActionEffect | undefined {
  const effect = definition.actionEffect;
  if (effect === undefined) return undefined;
  if (!effect || typeof effect !== "object" || Array.isArray(effect)) throw new Error("Node action effect must be a contract.");
  if (Object.keys(effect).some((key) => key !== "effectClass" && key !== "commitWhen" && key !== "permissionConsequences")) throw new Error("Node action effect has an unknown field.");
  const resolved = readAutomationStudioResolvedActionEffect({
    effectClass: effect.effectClass,
    permissionConsequences: effect.permissionConsequences === undefined ? [] : effect.permissionConsequences
  });
  if (effect.commitWhen === undefined) return resolved;
  if (typeof effect.commitWhen !== "string" || !effect.commitWhen.trim() || effect.commitWhen !== effect.commitWhen.trim()) throw new Error("Node action effect predicate must name a boolean parameter.");
  const parameter = definition.parameters.find((candidate) => candidate.id === effect.commitWhen);
  if (!parameter || parameter.valueType !== "boolean") throw new Error("Node action effect predicate must name a declared boolean parameter.");
  if (parameter.defaultValue !== undefined && typeof parameter.defaultValue !== "boolean") throw new Error("Node action effect predicate must have a boolean default when present.");
  const value = Object.hasOwn(parameterValues, parameter.id) ? parameterValues[parameter.id] : parameter.defaultValue;
  return {
    effectClass: value === false ? resolved.effectClass : "commit",
    permissionConsequences: resolved.permissionConsequences
  };
}
