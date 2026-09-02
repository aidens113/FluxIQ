import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PHASE8_BROWSER_ENGINES,
  PHASE8_BUDGETS,
  PHASE8_VIEWPORTS,
  evaluatePhase8Budgets,
  evaluatePhase8Regression,
  phase8Statistics,
  type Phase8FixtureCounts,
  type Phase8MeasurementInput,
} from "./phase8-certification";

const contract = JSON.parse(readFileSync(resolve(process.cwd(), "e2e/support/phase8-fixture-contract.json"), "utf8")) as {
  profiles: Record<string, Phase8FixtureCounts>;
};

describe("Phase 8 browser and scale certification", () => {
  it("pins the exact Empty, Ordinary, and Scale storage contracts", () => {
    expect(contract.profiles.empty).toEqual({
      projects: 1, flows: 1, subflows: 0, hierarchyObjects: 1, activeGraphNodes: 0,
      routes: 0, runEvents: 0, problems: 0, docs: 0, recordings: 0, runs: 0, adaptations: 0,
    });
    expect(contract.profiles.ordinary).toMatchObject({
      flows: 25, subflows: 250, hierarchyObjects: 5_000, activeGraphNodes: 1_000,
      routes: 2_500, runEvents: 10_000, problems: 5_000, docs: 5_000,
    });
    expect(contract.profiles.scale).toMatchObject({
      flows: 250, subflows: 5_000, hierarchyObjects: 50_000, activeGraphNodes: 5_000,
      routes: 10_000, runEvents: 250_000, problems: 100_000, docs: 100_000,
    });
  });

  it("pins all three browser engines and the complete Phase 7 viewport matrix", () => {
    expect(PHASE8_BROWSER_ENGINES).toEqual(["chromium", "edge", "firefox"]);
    expect(Object.values(PHASE8_VIEWPORTS)).toEqual([
      { width: 1440, height: 900, deviceScaleFactor: 1 },
      { width: 768, height: 500, deviceScaleFactor: 1 },
      { width: 320, height: 568, deviceScaleFactor: 1 },
      { width: 720, height: 450, deviceScaleFactor: 2 },
    ]);
  });

  it("computes deterministic median, p95, and maximum statistics", () => {
    expect(phase8Statistics([100, 1, 3, 2, 4])).toEqual({ median: 3, p95: 100, maximum: 100 });
    expect(phase8Statistics([])).toEqual({ median: 0, p95: 0, maximum: 0 });
  });

  it("enforces every absolute resource and interaction budget", () => {
    const passing: Phase8MeasurementInput = {
      profile: "ordinary", inputFeedbackMs: [10, 20], warmSwitchMs: [40], projectEntryMs: [700],
      shellFeedbackMs: [40], coreInteractionLongTasksMs: [80], virtualScrollFramesMs: [16, 24],
      domNodes: 4_000, warmViews: 6, constrained: false, listenerBaseline: 100, listenerFinal: 110,
      subscriptionBaseline: 20, subscriptionFinal: 22, heapBaselineBytes: 100 * 1024 * 1024,
      heapFinalBytes: 140 * 1024 * 1024, cacheWithinBounds: true, updateDepthWarnings: 0,
      criticalAccessibilityViolations: 0,
    };
    expect(evaluatePhase8Budgets(passing)).toEqual([]);
    const failing = evaluatePhase8Budgets({
      ...passing,
      inputFeedbackMs: [PHASE8_BUDGETS.inputFeedbackMaxMs + 1],
      domNodes: PHASE8_BUDGETS.ordinaryDomNodeMax + 1,
      listenerFinal: 112,
      cacheWithinBounds: false,
      updateDepthWarnings: 1,
      criticalAccessibilityViolations: 1,
    });
    expect(failing.map((item) => item.metric)).toEqual(expect.arrayContaining([
      "inputFeedback.p95", "inputFeedback.maximum", "domNodes", "listeners",
      "cacheWithinBounds", "updateDepthWarnings", "criticalAccessibilityViolations",
    ]));
  });

  it("fails a greater-than-20-percent accepted-baseline regression", () => {
    expect(evaluatePhase8Regression(120, 100)).toEqual([]);
    expect(evaluatePhase8Regression(121, 100)).toHaveLength(1);
  });
});
