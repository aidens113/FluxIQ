import type { JsonObject } from "../../../core/index.ts";
import type { AutomationCondition, AutomationConditionExpression } from "../model/conditions.ts";
import type {
  AutomationStudioAdaptationPolicy,
  AutomationStudioFlowArtifact,
  AutomationStudioFlowRouteRule,
  AutomationStudioFlowRouter,
  AutomationStudioFlowRunStatus,
  AutomationStudioFlowSubflow,
  AutomationStudioRouteDecisionRecord
} from "../model/index.ts";

export type AutomationStudioRouterExecutionInput = {
  projectId: string;
  flowId: string;
  flowVersion?: string;
  inputs?: JsonObject;
  currentStateSummary?: JsonObject;
  router: AutomationStudioFlowRouter;
  subflows: AutomationStudioFlowSubflow[];
  adaptationPolicy?: AutomationStudioAdaptationPolicy;
  rerouteSource?: { fromSubflowId: string; reason: string };
  now?: () => number;
};

export type AutomationStudioCompiledRouteRule = {
  rule: AutomationStudioFlowRouteRule;
  targetSubflow: AutomationStudioFlowSubflow | null;
  disabled: boolean;
};

export type AutomationStudioRoutePlanDiagnostic = {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  ruleId?: string;
  subflowId?: string;
};

export type AutomationStudioRouterExecutionPlan = {
  routerId: string;
  flowId: string;
  status: AutomationStudioFlowRunStatus;
  rules: AutomationStudioCompiledRouteRule[];
  fallbackSubflow: AutomationStudioFlowSubflow | null;
  fallbackFailure?: string;
  diagnostics: AutomationStudioRoutePlanDiagnostic[];
};

export type AutomationStudioRouteRuleEvaluation = {
  ruleId: string;
  matched: boolean;
  reason: string;
  targetSubflowId?: string;
};

export type AutomationStudioRouterExecutionResult = {
  status: AutomationStudioFlowRunStatus;
  selectedSubflow: AutomationStudioFlowSubflow | null;
  decision: AutomationStudioRouteDecisionRecord;
  evaluations: AutomationStudioRouteRuleEvaluation[];
  diagnostics: AutomationStudioRoutePlanDiagnostic[];
};

export function defaultAutomationStudioSubflowForFlow(flow: AutomationStudioFlowArtifact): AutomationStudioFlowSubflow {
  return {
    schemaVersion: "0.1",
    subflowId: `${flow.flowId}.default-subflow`,
    flowId: flow.flowId,
    projectId: flow.projectId,
    name: flow.name,
    ...(flow.description ? { description: flow.description } : {}),
    role: "primary",
    status: "active",
    graphFlowId: flow.flowId,
    createdAt: flow.createdAt,
    updatedAt: flow.updatedAt,
    metadata: { generatedDefault: true }
  };
}

export function compileAutomationStudioRouterPlan(input: {
  router: AutomationStudioFlowRouter;
  subflows: AutomationStudioFlowSubflow[];
}): AutomationStudioRouterExecutionPlan {
  const subflowsById = new Map(input.subflows.map((subflow) => [subflow.subflowId, subflow]));
  const diagnostics: AutomationStudioRoutePlanDiagnostic[] = [];
  const rules = [...input.router.rules]
    .sort((left, right) => left.order - right.order || left.ruleId.localeCompare(right.ruleId))
    .map((rule) => {
      const targetSubflow = subflowsById.get(rule.target.subflowId) ?? null;
      if (!targetSubflow) {
        diagnostics.push({
          severity: "error",
          code: "router.rule_missing_target",
          message: `Route rule ${rule.ruleId} targets missing subflow ${rule.target.subflowId}.`,
          ruleId: rule.ruleId,
          subflowId: rule.target.subflowId
        });
      }
      return {
        rule,
        targetSubflow,
        disabled: rule.status !== "active" || targetSubflow?.status !== "active"
      };
    });
  let fallbackSubflow: AutomationStudioFlowSubflow | null = null;
  let fallbackFailure: string | undefined;
  if (input.router.fallback?.kind === "subflow") {
    fallbackSubflow = subflowsById.get(input.router.fallback.subflowId) ?? null;
    if (!fallbackSubflow) {
      diagnostics.push({
        severity: "error",
        code: "router.fallback_missing_target",
        message: `Router fallback targets missing subflow ${input.router.fallback.subflowId}.`,
        subflowId: input.router.fallback.subflowId
      });
    }
  } else if (input.router.fallback?.kind === "fail") {
    fallbackFailure = input.router.fallback.message ?? "No route matched and router fallback is configured to fail.";
  }
  return {
    routerId: input.router.routerId,
    flowId: input.router.flowId,
    status: diagnostics.some((diagnostic) => diagnostic.severity === "error") ? "failed" : "queued",
    rules,
    fallbackSubflow,
    ...(fallbackFailure ? { fallbackFailure } : {}),
    diagnostics
  };
}

export function runAutomationStudioRouter(input: AutomationStudioRouterExecutionInput): AutomationStudioRouterExecutionResult {
  const plan = compileAutomationStudioRouterPlan({ router: input.router, subflows: input.subflows });
  const decidedAt = input.now?.() ?? Date.now();
  const evaluations: AutomationStudioRouteRuleEvaluation[] = [];
  const rejectedRuleIds: string[] = [];
  if (plan.status === "failed") {
    return routerFailureResult(input, plan, evaluations, rejectedRuleIds, decidedAt);
  }
  for (const candidate of plan.rules) {
    if (candidate.disabled) {
      rejectedRuleIds.push(candidate.rule.ruleId);
      evaluations.push({
        ruleId: candidate.rule.ruleId,
        matched: false,
        reason: candidate.targetSubflow?.status !== "active" ? "Target subflow is not active." : "Rule is not active.",
        targetSubflowId: candidate.rule.target.subflowId
      });
      continue;
    }
    const evaluation = evaluateConditionExpression(candidate.rule.condition, input);
    evaluations.push({
      ruleId: candidate.rule.ruleId,
      matched: evaluation.matched,
      reason: evaluation.reason,
      targetSubflowId: candidate.rule.target.subflowId
    });
    if (!evaluation.matched) {
      rejectedRuleIds.push(candidate.rule.ruleId);
      continue;
    }
    return {
      status: "running",
      selectedSubflow: candidate.targetSubflow,
      decision: {
        decisionId: `route-decision.${input.router.routerId}.${decidedAt}`,
        routerId: input.router.routerId,
        selectedRuleId: candidate.rule.ruleId,
        selectedSubflowId: candidate.rule.target.subflowId,
        rejectedRuleIds,
        decidedAt,
        metadata: routeDecisionMetadata(input, evaluations)
      },
      evaluations,
      diagnostics: plan.diagnostics
    };
  }
  if (plan.fallbackSubflow?.status === "active") {
    return {
      status: "running",
      selectedSubflow: plan.fallbackSubflow,
      decision: {
        decisionId: `route-decision.${input.router.routerId}.${decidedAt}`,
        routerId: input.router.routerId,
        selectedSubflowId: plan.fallbackSubflow.subflowId,
        fallbackUsed: true,
        rejectedRuleIds,
        decidedAt,
        metadata: routeDecisionMetadata(input, evaluations)
      },
      evaluations,
      diagnostics: plan.diagnostics
    };
  }
  return routerFailureResult(input, plan, evaluations, rejectedRuleIds, decidedAt);
}

function routerFailureResult(
  input: AutomationStudioRouterExecutionInput,
  plan: AutomationStudioRouterExecutionPlan,
  evaluations: AutomationStudioRouteRuleEvaluation[],
  rejectedRuleIds: string[],
  decidedAt: number
): AutomationStudioRouterExecutionResult {
  const diagnostics = plan.diagnostics.length
    ? plan.diagnostics
    : [{
      severity: "error" as const,
      code: "router.no_route",
      message: plan.fallbackFailure ?? "No active route matched and no active fallback subflow is configured."
    }];
  return {
    status: "failed",
    selectedSubflow: null,
    decision: {
      decisionId: `route-decision.${input.router.routerId}.${decidedAt}`,
      routerId: input.router.routerId,
      fallbackUsed: Boolean(plan.fallbackFailure),
      rejectedRuleIds,
      decidedAt,
      metadata: routeDecisionMetadata(input, evaluations, diagnostics)
    },
    evaluations,
    diagnostics
  };
}

function routeDecisionMetadata(
  input: AutomationStudioRouterExecutionInput,
  evaluations: AutomationStudioRouteRuleEvaluation[],
  diagnostics: AutomationStudioRoutePlanDiagnostic[] = []
): JsonObject {
  return {
    evaluationCount: evaluations.length,
    ...(input.rerouteSource ? { rerouteSource: input.rerouteSource } : {}),
    ...(diagnostics.length ? { diagnostics: diagnostics.map((diagnostic) => ({ ...diagnostic })) } : {})
  };
}

export function evaluateAutomationStudioRouteCondition(
  expression: AutomationConditionExpression | undefined,
  input: { inputs?: JsonObject; currentStateSummary?: JsonObject }
): { matched: boolean; reason: string } {
  return evaluateConditionExpression(expression, input as AutomationStudioRouterExecutionInput);
}
function evaluateConditionExpression(expression: AutomationConditionExpression | undefined, input: AutomationStudioRouterExecutionInput): { matched: boolean; reason: string } {
  if (!expression) return { matched: true, reason: "No condition configured." };
  if ("conditions" in expression) {
    const children = expression.conditions.map((child) => evaluateConditionExpression(child, input));
    if (expression.type === "all") return { matched: children.every((child) => child.matched), reason: conditionGroupReason(expression.type, children) };
    if (expression.type === "any") return { matched: children.some((child) => child.matched), reason: conditionGroupReason(expression.type, children) };
    if (expression.type === "none") return { matched: children.every((child) => !child.matched), reason: conditionGroupReason(expression.type, children) };
    const weightedScore = expression.conditions.reduce((score, child, index) => score + (children[index]?.matched ? child.weight : 0), 0);
    return { matched: weightedScore >= expression.threshold, reason: `Weighted condition score ${weightedScore} ${weightedScore >= expression.threshold ? "met" : "missed"} threshold ${expression.threshold}.` };
  }
  return evaluateCondition(expression, input);
}

function conditionGroupReason(type: "all" | "any" | "none", children: Array<{ matched: boolean }>): string {
  const matched = children.filter((child) => child.matched).length;
  return `${type} group matched ${matched} of ${children.length} conditions.`;
}

function evaluateCondition(condition: AutomationCondition, input: AutomationStudioRouterExecutionInput): { matched: boolean; reason: string } {
  const value = valueAtPath({ inputs: input.inputs ?? {}, state: input.currentStateSummary ?? {} }, condition.signalPath);
  const expected = condition.expected;
  if (condition.operator === "exists") return { matched: value !== undefined && value !== null, reason: `${condition.signalPath} ${value === undefined || value === null ? "does not exist" : "exists"}.` };
  if (condition.operator === "equals") return { matched: value === expected, reason: `${condition.signalPath} equals expected value: ${String(value === expected)}.` };
  if (condition.operator === "not_equals") return { matched: value !== expected, reason: `${condition.signalPath} differs from expected value: ${String(value !== expected)}.` };
  if (condition.operator === "greater_than") return compareNumbers(value, expected, (left, right) => left > right, condition.signalPath, "greater than");
  if (condition.operator === "less_than") return compareNumbers(value, expected, (left, right) => left < right, condition.signalPath, "less than");
  if (condition.operator === "contains") return { matched: String(value ?? "").includes(String(expected ?? "")), reason: `${condition.signalPath} contains expected text.` };
  if (condition.operator === "matches") return matchesPattern(value, expected, condition.signalPath);
  if (condition.operator === "became_true") return { matched: value === true, reason: `${condition.signalPath} is true.` };
  if (condition.operator === "became_false") return { matched: value === false, reason: `${condition.signalPath} is false.` };
  if (condition.operator === "similar_to") return { matched: normalizedText(value) === normalizedText(expected), reason: `${condition.signalPath} normalized text comparison evaluated.` };
  return { matched: false, reason: `${condition.operator} requires transition history and is not supported by the router matcher yet.` };
}

function compareNumbers(value: unknown, expected: unknown, compare: (left: number, right: number) => boolean, path: string, label: string): { matched: boolean; reason: string } {
  const left = Number(value);
  const right = Number(expected);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return { matched: false, reason: `${path} cannot be compared as a number.` };
  return { matched: compare(left, right), reason: `${path} is ${label} ${right}: ${compare(left, right)}.` };
}

function matchesPattern(value: unknown, expected: unknown, path: string): { matched: boolean; reason: string } {
  if (typeof expected !== "string") return { matched: false, reason: `${path} match expected value is not a pattern string.` };
  try {
    const matched = new RegExp(expected).test(String(value ?? ""));
    return { matched, reason: `${path} regex match evaluated.` };
  } catch {
    return { matched: false, reason: `${path} regex pattern is invalid.` };
  }
}

function normalizedText(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function valueAtPath(root: JsonObject, path: string): unknown {
  const parts = path.split(".").filter(Boolean);
  let value: unknown = root;
  for (const part of parts) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}
