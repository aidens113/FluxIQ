import { describe, expect, it } from "vitest";
import {
  evaluateRequestBudget,
  evaluateRenderBudget,
  evaluateStudioScenarioBudgets,
  UI_PERFORMANCE_BUDGETS
} from "./ui-performance-budgets";

describe("UI performance budgets", () => {
  it("flags oversized or slow detail requests", () => {
    const violations = evaluateRequestBudget({
      endpoint: "get-flow-run-detail",
      elapsedMs: UI_PERFORMANCE_BUDGETS.detailRequestMs + 1,
      responseBytes: UI_PERFORMANCE_BUDGETS.runDetailBytes + 1,
      classification: "detail"
    });
    expect(violations.map((item) => item.budget)).toEqual(["detailRequestMs", "runDetailBytes"]);
  });

  it("flags runaway Studio render counts only", () => {
    expect(evaluateRenderBudget({ component: "AutomationStudioLive", count: 41 })).toHaveLength(1);
    expect(evaluateRenderBudget({ component: "ProgramLauncher", count: 100 })).toEqual([]);
  });

  it("evaluates scenario requests, interactions, and long tasks", () => {
    const violations = evaluateStudioScenarioBudgets({
      apiMetrics: Array.from({ length: 25 }, (_, index) => ({
        endpoint: `list-${index}`,
        elapsedMs: 1,
        responseBytes: 1,
        classification: "summary" as const
      })),
      longTasks: [{ duration: 51 }],
      renderMetrics: [],
      interactions: { selectFirstFlow: 101 }
    });
    expect(violations.map((item) => item.budget)).toEqual([
      "scenarioRequestCount", "longTaskMs", "flowSwitchMs"
    ]);
  });
});
