export const UI_PERFORMANCE_BUDGETS = {
  projectOpenMs: 1_000,
  flowSwitchMs: 100,
  runListOpenMs: 500,
  longTaskMs: 50,
  runDetailBytes: 250 * 1024,
  summaryRequestMs: 500,
  detailRequestMs: 1_000,
  scenarioRequestCount: 24,
  studioRenderCount: 40
} as const;

export type UiPerformanceBudgetViolation = {
  budget: keyof typeof UI_PERFORMANCE_BUDGETS;
  actual: number;
  limit: number;
  unit: "ms" | "bytes" | "count";
  context: string;
};

export type UiRequestPerformanceMetric = {
  endpoint: string;
  elapsedMs: number;
  responseBytes: number;
  classification: "summary" | "detail" | "mutation" | "other";
};

type RenderMetric = { component: string; count: number };

export function evaluateRequestBudget(metric: UiRequestPerformanceMetric): UiPerformanceBudgetViolation[] {
  const violations: UiPerformanceBudgetViolation[] = [];
  if (metric.classification === "summary" && metric.elapsedMs > UI_PERFORMANCE_BUDGETS.summaryRequestMs) {
    violations.push({
      budget: "summaryRequestMs",
      actual: metric.elapsedMs,
      limit: UI_PERFORMANCE_BUDGETS.summaryRequestMs,
      unit: "ms",
      context: metric.endpoint
    });
  }
  if (metric.classification === "detail" && metric.elapsedMs > UI_PERFORMANCE_BUDGETS.detailRequestMs) {
    violations.push({
      budget: "detailRequestMs",
      actual: metric.elapsedMs,
      limit: UI_PERFORMANCE_BUDGETS.detailRequestMs,
      unit: "ms",
      context: metric.endpoint
    });
  }
  if (metric.classification === "detail" && metric.responseBytes > UI_PERFORMANCE_BUDGETS.runDetailBytes) {
    violations.push({
      budget: "runDetailBytes",
      actual: metric.responseBytes,
      limit: UI_PERFORMANCE_BUDGETS.runDetailBytes,
      unit: "bytes",
      context: metric.endpoint
    });
  }
  return violations;
}

export function evaluateRenderBudget(metric: RenderMetric): UiPerformanceBudgetViolation[] {
  if (!metric.component.startsWith("AutomationStudio") || metric.count <= UI_PERFORMANCE_BUDGETS.studioRenderCount) return [];
  return [{
    budget: "studioRenderCount",
    actual: metric.count,
    limit: UI_PERFORMANCE_BUDGETS.studioRenderCount,
    unit: "count",
    context: metric.component
  }];
}

export function evaluateStudioScenarioBudgets(snapshot: {
  apiMetrics: UiRequestPerformanceMetric[];
  longTasks: Array<{ duration: number }>;
  renderMetrics: RenderMetric[];
  interactions: Record<string, number>;
}): UiPerformanceBudgetViolation[] {
  const violations = snapshot.apiMetrics.flatMap(evaluateRequestBudget);
  if (snapshot.apiMetrics.length > UI_PERFORMANCE_BUDGETS.scenarioRequestCount) {
    violations.push({
      budget: "scenarioRequestCount",
      actual: snapshot.apiMetrics.length,
      limit: UI_PERFORMANCE_BUDGETS.scenarioRequestCount,
      unit: "count",
      context: "Automation Studio scale scenario"
    });
  }
  for (const task of snapshot.longTasks) {
    if (task.duration > UI_PERFORMANCE_BUDGETS.longTaskMs) {
      violations.push({
        budget: "longTaskMs",
        actual: task.duration,
        limit: UI_PERFORMANCE_BUDGETS.longTaskMs,
        unit: "ms",
        context: "main thread"
      });
    }
  }
  const latestRenderByComponent = new Map<string, RenderMetric>();
  for (const metric of snapshot.renderMetrics) latestRenderByComponent.set(metric.component, metric);
  for (const metric of latestRenderByComponent.values()) violations.push(...evaluateRenderBudget(metric));
  const interactionBudgets: Array<[string, keyof typeof UI_PERFORMANCE_BUDGETS]> = [
    ["openScaleProject", "projectOpenMs"],
    ["selectFirstFlow", "flowSwitchMs"],
    ["openRuntimeDebug", "runListOpenMs"]
  ];
  for (const [interaction, budget] of interactionBudgets) {
    const actual = snapshot.interactions[interaction];
    const limit = UI_PERFORMANCE_BUDGETS[budget];
    if (actual !== undefined && actual > limit) {
      violations.push({ budget, actual, limit, unit: "ms", context: interaction });
    }
  }
  return violations;
}

export function formatUiPerformanceViolations(violations: UiPerformanceBudgetViolation[]): string {
  return violations
    .map((violation) => `${violation.context}: ${violation.budget} was ${Math.round(violation.actual)}${violation.unit}, limit ${violation.limit}${violation.unit}`)
    .join("\n");
}
