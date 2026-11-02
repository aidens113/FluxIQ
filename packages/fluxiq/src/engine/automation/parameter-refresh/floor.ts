import type { JsonValue } from "../../../core/index.ts";
import type { AutomationStudioFlowNode } from "../../../flows/executable/graph/index.ts";
import { combineAutomationStudioResolvedActionEffects, type AutomationStudioResolvedActionEffect } from "../../../components/automation/action-effect/index.ts";
import type { AutomationStudioGraphExecutionOptions } from "../index.ts";

/** A target refresh can retain an action's trusted safety floor but cannot grant stronger authority. */
export function automationStudioRefreshFloor(node: AutomationStudioFlowNode, before: Readonly<Record<string, JsonValue>>, after: Readonly<Record<string, JsonValue>>, options: AutomationStudioGraphExecutionOptions, previous?: AutomationStudioResolvedActionEffect): { kind: "accepted"; floor?: AutomationStudioResolvedActionEffect } | { kind: "rejected"; reason: "authority_changed" } | { kind: "unreadable"; reason: "action_effect_unavailable" } {
  try {
    const original = combineAutomationStudioResolvedActionEffects([previous, options.resolveActionEffect?.(node, before)]);
    const fresh = combineAutomationStudioResolvedActionEffects([options.resolveActionEffect?.(node, after)]);
    const rank = (floor: AutomationStudioResolvedActionEffect | undefined) => floor?.effectClass === "commit" ? 2 : floor?.effectClass === "state" ? 1 : 0;
    if (rank(fresh) > rank(original) || fresh?.permissionConsequences.some((consequence) => !original?.permissionConsequences.includes(consequence))) return { kind: "rejected", reason: "authority_changed" };
    const floor = combineAutomationStudioResolvedActionEffects([original, fresh]);
    return { kind: "accepted", ...(floor ? { floor } : {}) };
  } catch {
    return { kind: "unreadable", reason: "action_effect_unavailable" };
  }
}
