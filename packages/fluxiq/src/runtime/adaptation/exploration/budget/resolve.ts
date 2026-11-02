import type { AutomationStudioExplorationBudget } from "./contract.ts";
import type { AutomationStudioExplorationScopePolicy } from "../scope/index.ts";
import { AUTOMATION_STUDIO_EXPLORATION_BUDGET_DEFAULTS } from "./defaults.ts";
import { AUTOMATION_STUDIO_EXPLORATION_BUDGET_CEILINGS } from "./ceilings.ts";

/**
 * A budget from whatever a caller asked for, clamped into range.
 *
 * Clamped rather than refused, and the direction is always downwards. A
 * recovery is already a failure being handled, so throwing over a badly
 * configured number would replace a bounded exploration with none at all; and
 * clamping upwards would let a caller widen a ceiling by asking for nonsense.
 */
export function resolveAutomationStudioExplorationBudget(input?: Partial<Omit<AutomationStudioExplorationBudget, "schemaVersion" | "allowDestructive">>): AutomationStudioExplorationBudget {
  const defaults = AUTOMATION_STUDIO_EXPLORATION_BUDGET_DEFAULTS;
  const ceilings = AUTOMATION_STUDIO_EXPLORATION_BUDGET_CEILINGS;
  return {
    schemaVersion: "automation-studio.exploration-budget.v1",
    maxDurationMs: clamp(input?.maxDurationMs, defaults.maxDurationMs, 1, ceilings.maxDurationMs),
    maxActions: clamp(input?.maxActions, defaults.maxActions, 1, ceilings.maxActions),
    maxProviderCalls: clamp(input?.maxProviderCalls, defaults.maxProviderCalls, 1, ceilings.maxProviderCalls),
    maxRefusedActions: clamp(input?.maxRefusedActions, defaults.maxRefusedActions, 1, ceilings.maxRefusedActions),
    maxRepeatsPerAction: clamp(input?.maxRepeatsPerAction, defaults.maxRepeatsPerAction, 1, ceilings.maxRepeatsPerAction),
    maxStepsWithoutProgress: clamp(input?.maxStepsWithoutProgress, defaults.maxStepsWithoutProgress, 1, ceilings.maxStepsWithoutProgress),
    allowDestructive: false,
    scopePolicy: scopePolicy(input?.scopePolicy) ?? defaults.scopePolicy
  };
}

function clamp(value: number | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.trunc(value), min), max);
}

function scopePolicy(value: AutomationStudioExplorationScopePolicy | undefined): AutomationStudioExplorationScopePolicy | undefined {
  if (!value) return undefined;
  if (value.kind === "same_scope") return { kind: "same_scope" };
  if (value.kind !== "allowlist" || !Array.isArray(value.scopes)) return undefined;
  const scopes = value.scopes.filter((scope): scope is string => typeof scope === "string" && scope.length > 0 && scope.length <= 2_000).slice(0, 50);
  return { kind: "allowlist", scopes };
}
