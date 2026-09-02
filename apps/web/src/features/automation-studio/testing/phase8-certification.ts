export type Phase8FixtureProfileName = "empty" | "ordinary" | "scale";

export type Phase8FixtureCounts = {
  projects: number;
  flows: number;
  subflows: number;
  hierarchyObjects: number;
  activeGraphNodes: number;
  routes: number;
  runEvents: number;
  problems: number;
  docs: number;
  recordings: number;
  runs: number;
  adaptations: number;
};

export const PHASE8_BROWSER_ENGINES = ["chromium", "edge", "firefox"] as const;
export const PHASE8_VIEWPORTS = Object.freeze({
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1 },
  shortTablet: { width: 768, height: 500, deviceScaleFactor: 1 },
  mobile: { width: 320, height: 568, deviceScaleFactor: 1 },
  zoom200: { width: 720, height: 450, deviceScaleFactor: 2 },
});

export const PHASE8_BUDGETS = Object.freeze({
  inputFeedbackP95Ms: 50,
  inputFeedbackMaxMs: 100,
  warmSwitchP95Ms: 100,
  projectEntryP95Ms: 1_000,
  shellFeedbackMaxMs: 100,
  coreInteractionLongTaskMaxMs: 100,
  virtualScrollFrameP95Ms: 32,
  desktopWarmViewCap: 6,
  constrainedWarmViewCap: 3,
  ordinaryDomNodeMax: 5_000,
  scaleDomNodeMax: 10_000,
  soakCycles: 50,
  soakViewCount: 10,
  listenerGrowthRatio: 0.1,
  heapGrowthRatio: 0.2,
  heapGrowthFloorBytes: 50 * 1024 * 1024,
  regressionRatio: 0.2,
  warmupRepetitions: 2,
  measuredRepetitions: 10,
  criticalAccessibilityViolations: 0,
});

export type Phase8Statistics = { median: number; p95: number; maximum: number };

export type Phase8MeasurementInput = {
  profile: Phase8FixtureProfileName;
  inputFeedbackMs: number[];
  warmSwitchMs: number[];
  projectEntryMs: number[];
  shellFeedbackMs: number[];
  coreInteractionLongTasksMs: number[];
  virtualScrollFramesMs: number[];
  domNodes: number;
  warmViews: number;
  constrained: boolean;
  listenerBaseline: number;
  listenerFinal: number;
  subscriptionBaseline: number;
  subscriptionFinal: number;
  heapBaselineBytes: number;
  heapFinalBytes: number;
  cacheWithinBounds: boolean;
  updateDepthWarnings: number;
  criticalAccessibilityViolations: number;
};

export type Phase8BudgetViolation = {
  metric: string;
  actual: number | boolean;
  limit: number | boolean;
};

export function phase8Statistics(values: readonly number[]): Phase8Statistics {
  if (values.length === 0) return { median: 0, p95: 0, maximum: 0 };
  const sorted = [...values].sort((left, right) => left - right);
  return {
    median: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    maximum: sorted[sorted.length - 1]!,
  };
}

export function evaluatePhase8Budgets(input: Phase8MeasurementInput): Phase8BudgetViolation[] {
  const violations: Phase8BudgetViolation[] = [];
  const inputStats = phase8Statistics(input.inputFeedbackMs);
  const warmStats = phase8Statistics(input.warmSwitchMs);
  const projectStats = phase8Statistics(input.projectEntryMs);
  const shellStats = phase8Statistics(input.shellFeedbackMs);
  const frameStats = phase8Statistics(input.virtualScrollFramesMs);
  const longestTask = phase8Statistics(input.coreInteractionLongTasksMs).maximum;
  check(violations, "inputFeedback.p95", inputStats.p95, PHASE8_BUDGETS.inputFeedbackP95Ms);
  check(violations, "inputFeedback.maximum", inputStats.maximum, PHASE8_BUDGETS.inputFeedbackMaxMs);
  check(violations, "warmSwitch.p95", warmStats.p95, PHASE8_BUDGETS.warmSwitchP95Ms);
  check(violations, "projectEntry.p95", projectStats.p95, PHASE8_BUDGETS.projectEntryP95Ms);
  check(violations, "shellFeedback.maximum", shellStats.maximum, PHASE8_BUDGETS.shellFeedbackMaxMs);
  check(violations, "coreInteraction.longestTask", longestTask, PHASE8_BUDGETS.coreInteractionLongTaskMaxMs);
  check(violations, "virtualScrollFrame.p95", frameStats.p95, PHASE8_BUDGETS.virtualScrollFrameP95Ms);
  check(violations, "domNodes", input.domNodes, input.profile === "scale" ? PHASE8_BUDGETS.scaleDomNodeMax : PHASE8_BUDGETS.ordinaryDomNodeMax);
  check(violations, "warmViews", input.warmViews, input.constrained ? PHASE8_BUDGETS.constrainedWarmViewCap : PHASE8_BUDGETS.desktopWarmViewCap);
  checkGrowth(violations, "listeners", input.listenerBaseline, input.listenerFinal, PHASE8_BUDGETS.listenerGrowthRatio);
  checkGrowth(violations, "subscriptions", input.subscriptionBaseline, input.subscriptionFinal, PHASE8_BUDGETS.listenerGrowthRatio);
  const heapGrowth = Math.max(0, input.heapFinalBytes - input.heapBaselineBytes);
  const heapLimit = Math.max(input.heapBaselineBytes * PHASE8_BUDGETS.heapGrowthRatio, PHASE8_BUDGETS.heapGrowthFloorBytes);
  check(violations, "heapGrowthBytes", heapGrowth, heapLimit);
  check(violations, "updateDepthWarnings", input.updateDepthWarnings, 0);
  check(violations, "criticalAccessibilityViolations", input.criticalAccessibilityViolations, 0);
  if (!input.cacheWithinBounds) violations.push({ metric: "cacheWithinBounds", actual: false, limit: true });
  return violations;
}

export function evaluatePhase8Regression(current: number, accepted: number): Phase8BudgetViolation[] {
  if (!Number.isFinite(accepted) || accepted <= 0) return [];
  const limit = accepted * (1 + PHASE8_BUDGETS.regressionRatio);
  return current > limit ? [{ metric: "acceptedBaselineRegression", actual: current, limit }] : [];
}

function percentile(sorted: readonly number[], fraction: number): number {
  const index = Math.max(0, Math.ceil(sorted.length * fraction) - 1);
  return sorted[index] ?? 0;
}

function check(violations: Phase8BudgetViolation[], metric: string, actual: number, limit: number): void {
  if (!Number.isFinite(actual) || actual > limit) violations.push({ metric, actual, limit });
}

function checkGrowth(violations: Phase8BudgetViolation[], metric: string, baseline: number, final: number, ratio: number): void {
  const limit = baseline * (1 + ratio);
  if (final > limit) violations.push({ metric, actual: final, limit });
}
