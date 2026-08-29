import { compactConditionLabel, flowMapFallbackLabel } from "../runtime";

export const FLOW_MAP_CONDITION_OPERATORS = ["equals", "not_equals", "contains", "greater_than", "less_than", "exists", "matches", "similar_to"];

export function defaultFlowMapRouteDraft(overrides: Partial<ReturnType<typeof defaultFlowMapRouteDraftShape>> = {}) {
  return { ...defaultFlowMapRouteDraftShape(), ...overrides };
}

export function defaultFlowMapRouteDraftShape() {
  return { ruleId: "", name: "", description: "", targetSubflowId: "", order: 0, status: "active", groupId: "", confidence: 1, conditionMode: "always", conditionSource: "inputs", conditionField: "", conditionOperator: "equals", conditionValueType: "text", conditionExpected: "", setAsFallback: false };
}

export function flowMapRouteDraftFromRule(rule: any) {
  return defaultFlowMapRouteDraft({
    ruleId: rule.ruleId ?? "",
    name: rule.name ?? "",
    description: rule.description ?? "",
    targetSubflowId: rule.target?.kind === "subflow" ? rule.target.subflowId ?? "" : "",
    order: rule.order ?? 0,
    status: rule.status ?? "active",
    groupId: typeof rule.metadata?.groupId === "string" ? rule.metadata.groupId : "",
    confidence: typeof rule.confidence === "number" ? rule.confidence : 1,
    ...flowMapConditionDraft(rule.condition),
    setAsFallback: false
  });
}

export function buildFlowMapRouteTestPayload(draft: ReturnType<typeof defaultFlowMapRouteDraftShape>, actualValue: string): { condition?: any; inputs?: any; currentStateSummary?: any } {
  if (draft.conditionMode === "always") return {};
  const value = draft.conditionValueType === "number" ? Number(actualValue) : draft.conditionValueType === "boolean" ? actualValue === "true" : actualValue;
  const source = nestedRouteTestValue(draft.conditionField, value);
  const condition = {
    signalPath: draft.conditionSource + "." + draft.conditionField.trim(),
    operator: draft.conditionOperator,
    ...(draft.conditionOperator !== "exists" ? { expected: flowMapConditionExpected(draft) } : {})
  };
  return draft.conditionSource === "state" ? { condition, currentStateSummary: source } : { condition, inputs: source };
}
export function nestedRouteTestValue(path: string, value: unknown): Record<string, unknown> {
  const parts = path.split(".").map((part) => part.trim()).filter(Boolean);
  const root: Record<string, unknown> = {};
  let cursor = root;
  parts.forEach((part, index) => {
    if (index === parts.length - 1) cursor[part] = value;
    else {
      const child: Record<string, unknown> = {};
      cursor[part] = child;
      cursor = child;
    }
  });
  return root;
}
export function flowMapConditionDraft(condition: any) {
  const signalPath = typeof condition?.signalPath === "string" ? condition.signalPath : "";
  const source = signalPath.startsWith("state.") ? "state" : "inputs";
  const field = signalPath.startsWith(source + ".") ? signalPath.slice(source.length + 1) : signalPath;
  const expected = condition?.expected;
  return {
    conditionMode: signalPath ? "when" : "always",
    conditionSource: source,
    conditionField: field,
    conditionOperator: typeof condition?.operator === "string" ? condition.operator : "equals",
    conditionValueType: typeof expected === "boolean" ? "boolean" : typeof expected === "number" ? "number" : "text",
    conditionExpected: expected === undefined ? "" : String(expected)
  };
}

export function flowMapConditionExpected(draft: ReturnType<typeof defaultFlowMapRouteDraftShape>): unknown {
  if (draft.conditionMode === "always" || draft.conditionOperator === "exists") return undefined;
  if (draft.conditionValueType === "number") return Number(draft.conditionExpected);
  if (draft.conditionValueType === "boolean") return draft.conditionExpected === "true";
  return draft.conditionExpected;
}

export function flowMapConditionSummary(draft: ReturnType<typeof defaultFlowMapRouteDraftShape>): string {
  if (draft.conditionMode === "always") return "Always";
  const field = draft.conditionField.trim() || "Choose a field";
  const expected = draft.conditionOperator === "exists" ? "" : " " + String(flowMapConditionExpected(draft) ?? "");
  return (draft.conditionSource === "state" ? "Current state " : "Run input ") + field + " " + flowMapConditionOperatorLabel(draft.conditionOperator).toLowerCase() + expected;
}

export function flowMapConditionOperatorLabel(operator: string): string {
  return ({ exists: "Exists", equals: "Equals", not_equals: "Does not equal", contains: "Contains", greater_than: "Is greater than", less_than: "Is less than", matches: "Matches pattern", similar_to: "Is similar to" } as Record<string, string>)[operator] ?? operator.replaceAll("_", " ");
}
export function flowMapRouteGroupsFromRouter(router: any | null): any[] {
  const groups = Array.isArray(router?.metadata?.routeGroups) ? router.metadata.routeGroups : [];
  return groups.filter((group: any) => group?.groupId && group?.name).slice().sort((left: any, right: any) => (left.order ?? 0) - (right.order ?? 0) || String(left.name).localeCompare(String(right.name)));
}

export function flowMapConditionText(rule: any): string {
  if (rule?.condition) return compactConditionLabel(rule.condition);
  if (typeof rule?.metadata?.conditionSummary === "string" && rule.metadata.conditionSummary.trim()) return rule.metadata.conditionSummary.trim();
  return "Always";
}
export function flowMapRoutes(router: any | null): any[] {
  return (Array.isArray(router?.rules) ? router.rules : []).slice().sort((left: any, right: any) => (left.order ?? 0) - (right.order ?? 0) || String(left.name ?? left.ruleId).localeCompare(String(right.name ?? right.ruleId)));
}

export function nextFlowMapGroupOrder(groups: any[]): number {
  return groups.reduce((max, group) => Math.max(max, Number(group.order ?? 0)), -10) + 10;
}

export function targetSubflowLabel(subflows: any[], subflowId: string | undefined): string {
  if (!subflowId) return "No target";
  return subflows.find((subflow) => subflow.subflowId === subflowId)?.name ?? subflowId;
}
