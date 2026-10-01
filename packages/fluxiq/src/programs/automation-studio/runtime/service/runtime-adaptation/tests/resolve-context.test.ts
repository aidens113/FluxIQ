// A run's adaptation context reads every adaptation the Flow has.
//
// The user's order of 2026-09-30: "Remove ANY AND ALL LIMITS ON THE NUMBER OF
// ELEMENTS PASSED TO MODEL. DO NOT HIDE INFORMATION." The context read the newest
// 100 summaries and loaded the records of only the first 25, and those records
// are what the recovery context shows the model.

import { describe, expect, it } from "vitest";
import { createBlankAutomationStudioFlowArtifact, type AutomationStudioFlowAdaptation } from "../../../../model/index.ts";
import type { AutomationStudioTrainingAdaptationSummary } from "../../../training-modes.ts";
import { resolveAutomationStudioRuntimeAdaptationContext } from "../resolve-context.ts";

const PROJECT_ID = "project.every";
const flow = createBlankAutomationStudioFlowArtifact({ flowId: "flow.every", projectId: PROJECT_ID, name: "Every adaptation", now: 1 });
const COUNT = 260;

const summaries: AutomationStudioTrainingAdaptationSummary[] = Array.from({ length: COUNT }, (_unused, index) => ({
  adaptationId: `adaptation.${index}`, flowId: flow.flowId, projectId: PROJECT_ID, status: "proposed", riskLevel: "low", trigger: "runtime", updatedAt: 1_000 + index
} as AutomationStudioTrainingAdaptationSummary));

describe("a run's adaptation context", () => {
  it("reads every summary page after page and loads every record", async () => {
    const asked: Array<{ limit: number; offset: number }> = [];
    const loaded: string[] = [];
    const context = await resolveAutomationStudioRuntimeAdaptationContext({
      projectId: PROJECT_ID,
      flow,
      ports: {
        listFlowRunSummaries: async () => ({ runs: [] }),
        // The summary store's own page maximum is 100, and it reports the total.
        listFlowAdaptationSummaries: async ({ limit, offset }) => {
          asked.push({ limit, offset });
          return { adaptations: summaries.slice(offset, offset + Math.min(limit, 100)), total: COUNT };
        },
        getFlowAdaptation: async (_projectId, _flowId, adaptationId) => {
          loaded.push(adaptationId);
          return { adaptationId, flowId: flow.flowId, projectId: PROJECT_ID } as unknown as AutomationStudioFlowAdaptation;
        },
        readResultCheckState: async () => null
      }
    });
    expect(asked.map((page) => page.offset)).toEqual([0, 100, 200]);
    expect(context.recentAdaptationCount).toBe(COUNT);
    expect(loaded).toEqual(summaries.map((summary) => summary.adaptationId));
    expect(context.recentAdaptations).toHaveLength(COUNT);
  });

  it("stops on a short page when the port gives no total", async () => {
    let calls = 0;
    const context = await resolveAutomationStudioRuntimeAdaptationContext({
      projectId: PROJECT_ID,
      flow,
      ports: {
        listFlowRunSummaries: async () => ({ runs: [] }),
        listFlowAdaptationSummaries: async ({ offset }) => {
          calls += 1;
          return { adaptations: summaries.slice(offset, Math.min(offset + 100, 150)) };
        },
        getFlowAdaptation: async () => null,
        readResultCheckState: async () => null
      }
    });
    expect(calls).toBe(2);
    expect(context.recentAdaptationCount).toBe(150);
  });
});
