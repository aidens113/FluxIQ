export const UI_PERFORMANCE_BUDGETS = {
  projectOpenMs: 1_000,
  flowSwitchMs: 100,
  viewSwitchMs: 100,
  createFlowMs: 700,
  deleteFlowMs: 700,
  createFolderMs: 400,
  deleteFolderMs: 400,
  runListOpenMs: 500,
  runLogOpenMs: 600,
  graphSelectMs: 75,
  graphDragMs: 350,
  graphSaveMs: 1_000,
  longTaskMs: 50,
  runDetailBytes: 250 * 1024,
  summaryRequestMs: 500,
  detailRequestMs: 1_000,
  scenarioRequestCount: 24,
  interactionRequestCount: 4,
  interactionLongTaskCount: 1,
  interactionTimeoutCount: 0,
  studioRenderCount: 40,
  studioSwitchRetainedHeapBytes: 32 * 1024 * 1024,
  graphDomEntityCount: 900
} as const;

export const AUTOMATION_STUDIO_CERTIFICATION_INTERACTIONS = [
  "projectOpen",
  "viewSwitch",
  "createFlow",
  "deleteFlow",
  "createFolder",
  "deleteFolder",
  "runtimeDebugOpen",
  "runLogOpen",
  "graphSelect",
  "graphDrag",
  "graphSave"
] as const;

export type AutomationStudioCertificationInteraction = typeof AUTOMATION_STUDIO_CERTIFICATION_INTERACTIONS[number];

export const UI_PERFORMANCE_INTERACTION_BUDGETS: Record<AutomationStudioCertificationInteraction, {
  durationBudget: keyof typeof UI_PERFORMANCE_BUDGETS;
  maxRequestCount: number;
  maxLongTaskCount: number;
}> = {
  projectOpen: { durationBudget: "projectOpenMs", maxRequestCount: 12, maxLongTaskCount: 2 },
  viewSwitch: { durationBudget: "viewSwitchMs", maxRequestCount: 2, maxLongTaskCount: 0 },
  createFlow: { durationBudget: "createFlowMs", maxRequestCount: 4, maxLongTaskCount: 1 },
  deleteFlow: { durationBudget: "deleteFlowMs", maxRequestCount: 4, maxLongTaskCount: 1 },
  createFolder: { durationBudget: "createFolderMs", maxRequestCount: 3, maxLongTaskCount: 0 },
  deleteFolder: { durationBudget: "deleteFolderMs", maxRequestCount: 3, maxLongTaskCount: 0 },
  runtimeDebugOpen: { durationBudget: "runListOpenMs", maxRequestCount: 4, maxLongTaskCount: 1 },
  runLogOpen: { durationBudget: "runLogOpenMs", maxRequestCount: 4, maxLongTaskCount: 1 },
  graphSelect: { durationBudget: "graphSelectMs", maxRequestCount: 0, maxLongTaskCount: 0 },
  graphDrag: { durationBudget: "graphDragMs", maxRequestCount: 1, maxLongTaskCount: 0 },
  graphSave: { durationBudget: "graphSaveMs", maxRequestCount: 3, maxLongTaskCount: 1 }
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

export type UiInteractionPerformanceMetric = {
  duration: number;
  requestCount?: number;
  longTaskCount?: number;
  longTaskDuration?: number;
  timedOut?: boolean;
};

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

export function evaluateLongTaskBudget(metric: { duration: number; scope?: string }): UiPerformanceBudgetViolation[] {
  if (metric.duration <= UI_PERFORMANCE_BUDGETS.longTaskMs) return [];
  return [{
    budget: "longTaskMs",
    actual: metric.duration,
    limit: UI_PERFORMANCE_BUDGETS.longTaskMs,
    unit: "ms",
    context: metric.scope ?? "main thread"
  }];
}

export function resolveAutomationStudioInteractionBudget(interaction: string): AutomationStudioCertificationInteraction | null {
  if (isCertificationInteraction(interaction)) return interaction;
  if (interaction === "openRuntimeDebug") return "runtimeDebugOpen";
  if (interaction === "openRunLog" || interaction.startsWith("runLog")) return "runLogOpen";
  if (interaction === "selectFirstFlow" || interaction.startsWith("openEmpty") || interaction.startsWith("open-")) return "viewSwitch";
  if (interaction.startsWith("openScale") || interaction.startsWith("openSmall") || interaction.startsWith("project-")) return "projectOpen";
  if (interaction.startsWith("createFlow")) return "createFlow";
  if (interaction.startsWith("deleteFlow")) return "deleteFlow";
  if (interaction.startsWith("createFolder")) return "createFolder";
  if (interaction.startsWith("deleteFolder")) return "deleteFolder";
  if (interaction.startsWith("graphSelect")) return "graphSelect";
  if (interaction.startsWith("graphDrag")) return "graphDrag";
  if (interaction.startsWith("graphSave")) return "graphSave";
  return null;
}

export function evaluateInteractionBudget(interaction: string, metric: UiInteractionPerformanceMetric | number): UiPerformanceBudgetViolation[] {
  const interactionBudget = resolveAutomationStudioInteractionBudget(interaction);
  if (!interactionBudget) return [];
  const budget = UI_PERFORMANCE_INTERACTION_BUDGETS[interactionBudget];
  const duration = typeof metric === "number" ? metric : metric.duration;
  const violations: UiPerformanceBudgetViolation[] = [];
  const durationLimit = UI_PERFORMANCE_BUDGETS[budget.durationBudget];
  if (duration > durationLimit) {
    violations.push({ budget: budget.durationBudget, actual: duration, limit: durationLimit, unit: "ms", context: interaction });
  }
  if (typeof metric === "number") return violations;
  if (metric.timedOut) {
    violations.push({
      budget: "interactionTimeoutCount",
      actual: 1,
      limit: UI_PERFORMANCE_BUDGETS.interactionTimeoutCount,
      unit: "count",
      context: `${interaction} timed out waiting for settled Studio state`
    });
  }
  const requestLimit = budget.maxRequestCount;
  if ((metric.requestCount ?? 0) > requestLimit) {
    violations.push({ budget: "interactionRequestCount", actual: metric.requestCount ?? 0, limit: requestLimit, unit: "count", context: interaction });
  }
  const longTaskLimit = budget.maxLongTaskCount;
  if ((metric.longTaskCount ?? 0) > longTaskLimit) {
    violations.push({ budget: "interactionLongTaskCount", actual: metric.longTaskCount ?? 0, limit: longTaskLimit, unit: "count", context: interaction });
  }
  return violations;
}

export function evaluateStudioScenarioBudgets(snapshot: {
  apiMetrics: UiRequestPerformanceMetric[];
  longTasks: Array<{ duration: number }>;
  renderMetrics: RenderMetric[];
  interactions: Record<string, number>;
  interactionMetrics?: Record<string, UiInteractionPerformanceMetric> | undefined;
  graphDom?: { nodes: number; edges: number; minimapNodes: number };
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
  for (const task of snapshot.longTasks) violations.push(...evaluateLongTaskBudget(task));
  const latestRenderByComponent = new Map<string, RenderMetric>();
  for (const metric of snapshot.renderMetrics) latestRenderByComponent.set(metric.component, metric);
  for (const metric of latestRenderByComponent.values()) violations.push(...evaluateRenderBudget(metric));
  const graphDomEntityCount = snapshot.graphDom ? snapshot.graphDom.nodes + snapshot.graphDom.edges : 0;
  if (graphDomEntityCount > UI_PERFORMANCE_BUDGETS.graphDomEntityCount) {
    violations.push({
      budget: "graphDomEntityCount",
      actual: graphDomEntityCount,
      limit: UI_PERFORMANCE_BUDGETS.graphDomEntityCount,
      unit: "count",
      context: "Automation Studio graph DOM entities"
    });
  }
  for (const [interaction, metric] of Object.entries(snapshot.interactionMetrics ?? {})) {
    violations.push(...evaluateInteractionBudget(interaction, metric));
  }
  for (const [interaction, duration] of Object.entries(snapshot.interactions)) {
    if (snapshot.interactionMetrics?.[interaction]) continue;
    violations.push(...evaluateInteractionBudget(interaction, duration));
  }
  return violations;
}

export function formatUiPerformanceViolations(violations: UiPerformanceBudgetViolation[]): string {
  return violations
    .map((violation) => `${violation.context}: ${violation.budget} was ${Math.round(violation.actual)}${violation.unit}, limit ${violation.limit}${violation.unit}`)
    .join("\n");
}

function isCertificationInteraction(value: string): value is AutomationStudioCertificationInteraction {
  return (AUTOMATION_STUDIO_CERTIFICATION_INTERACTIONS as readonly string[]).includes(value);
}
