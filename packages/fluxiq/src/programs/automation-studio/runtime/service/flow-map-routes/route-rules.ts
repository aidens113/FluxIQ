import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowRouteGroup, AutomationStudioFlowRouteRule, AutomationStudioFlowRouter } from "../../../model/index.ts";
import { compactJsonObject } from "../compact-json.ts";
import type { UpsertFlowMapRouteInput } from "./contracts.ts";

// The route and route-group edits the Flow map applies: ordering, group
// membership carried in metadata, and the condition an upsert asks for.

export function withFlowMapRouteGroups(router: AutomationStudioFlowRouter, groups: AutomationStudioFlowRouteGroup[]): AutomationStudioFlowRouter {
  return {
    ...router,
    metadata: compactJsonObject({
      ...(router.metadata ?? {}),
      routeGroups: groups.slice().sort((left, right) => left.order - right.order || left.name.localeCompare(right.name))
    })
  };
}

export function nextRouteGroupOrder(groups: AutomationStudioFlowRouteGroup[]): number {
  return groups.reduce((max, group) => Math.max(max, group.order), -10) + 10;
}

export function nextRouteOrder(rules: AutomationStudioFlowRouteRule[]): number {
  return rules.reduce((max, rule) => Math.max(max, rule.order), -10) + 10;
}

export function routeRuleMetadataWithGroup(metadata: JsonObject | undefined, groupId: string | null | undefined): JsonObject | undefined {
  const next: Record<string, unknown> = { ...(metadata ?? {}) };
  if (typeof groupId === "string" && groupId.trim()) next.groupId = groupId.trim();
  if (groupId === null || groupId === "") delete next.groupId;
  return Object.keys(next).length ? next as JsonObject : undefined;
}

export function routeRuleMetadataWithoutGroup(metadata: JsonObject | undefined, groupId: string): JsonObject | undefined {
  const next: Record<string, unknown> = { ...(metadata ?? {}) };
  if (next.groupId === groupId) delete next.groupId;
  return Object.keys(next).length ? next as JsonObject : undefined;
}

export function flowMapExpansionStatus(value: unknown, fallback: AutomationStudioFlowRouteRule["status"]): AutomationStudioFlowRouteRule["status"] {
  return value === "active" || value === "disabled" || value === "archived" ? value : fallback;
}
export function routeConditionFromInput(input: UpsertFlowMapRouteInput): AutomationStudioFlowRouteRule["condition"] | undefined {
  const signalPath = input.conditionSignalPath?.trim();
  if (!signalPath) return undefined;
  const allowed = new Set(["equals", "not_equals", "exists", "greater_than", "less_than", "contains", "matches", "similar_to", "changed", "increased", "decreased", "became_true", "became_false", "stable_for"]);
  const operator = allowed.has(input.conditionOperator ?? "") ? input.conditionOperator! : "exists";
  return compactJsonObject({
    signalPath,
    operator,
    ...(operator !== "exists" && input.conditionExpected !== undefined ? { expected: input.conditionExpected } : {})
  }) as AutomationStudioFlowRouteRule["condition"];
}

export function removeUndefinedRouteRuleFields(rule: Record<string, unknown>): AutomationStudioFlowRouteRule {
  return Object.fromEntries(Object.entries(rule).filter(([, value]) => value !== undefined)) as unknown as AutomationStudioFlowRouteRule;
}
