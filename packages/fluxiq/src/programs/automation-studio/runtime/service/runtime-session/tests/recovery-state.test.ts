import { describe, expect, it, vi } from "vitest";
import type { AutomationStudioFlowRunDetail } from "../../../../model/index.ts";
import { annotateAutomationStudioRunDetailWithRecoveryState } from "../recovery-state.ts";

function detail(status: string, metadata: AutomationStudioFlowRunDetail["metadata"] = { kept: 1 }): AutomationStudioFlowRunDetail {
  return {
    schemaVersion: "0.1",
    summary: { runId: "run.one", projectId: "project.one", flowId: "flow.one", status } as unknown as AutomationStudioFlowRunDetail["summary"],
    routeDecisions: [],
    subflows: [],
    interventions: [],
    adaptationIds: [],
    changeProposalIds: [],
    metadata
  };
}

function clock(...times: number[]) {
  let index = 0;
  return () => times[Math.min(index++, times.length - 1)]!;
}

describe("a failed run's recovery on the record", () => {
  it("saves the run `running` before the recovery starts and hands back the annotated detail `ended`", async () => {
    const saved: AutomationStudioFlowRunDetail[] = [];
    const saveFlowRunDetail = vi.fn(async (value: AutomationStudioFlowRunDetail) => { saved.push(value); });
    const annotate = vi.fn(async (value: AutomationStudioFlowRunDetail) => {
      // The recovery starts only once `running` is stored, and is handed the unmarked detail.
      expect(saved).toHaveLength(1);
      expect(value.metadata).toEqual({ kept: 1 });
      return { ...value, metadata: { ...value.metadata, llmGate: { decision: "allowed" } } };
    });

    const result = await annotateAutomationStudioRunDetailWithRecoveryState({ detail: detail("failed"), recovering: true, annotate, saveFlowRunDetail, now: clock(100, 900) });

    expect(saved[0]!.metadata).toEqual({ kept: 1, recoveryState: { state: "running", startedAt: 100 } });
    expect(result.metadata).toEqual({ kept: 1, llmGate: { decision: "allowed" }, recoveryState: { state: "ended", startedAt: 100, endedAt: 900 } });
    // The caller's own save persists `ended`; this saves nothing more.
    expect(saveFlowRunDetail).toHaveBeenCalledTimes(1);
  });

  it("saves the pre-recovery detail `threw` with a code, never the message, and rethrows the recovery's error", async () => {
    const failure = new Error("provider said something private");
    const saved: AutomationStudioFlowRunDetail[] = [];
    const result = annotateAutomationStudioRunDetailWithRecoveryState({
      detail: detail("failed"),
      recovering: true,
      annotate: async () => { throw failure; },
      saveFlowRunDetail: async (value) => { saved.push(value); },
      now: clock(100, 700)
    });

    await expect(result).rejects.toBe(failure);
    expect(saved.map((value) => value.metadata)).toEqual([
      { kept: 1, recoveryState: { state: "running", startedAt: 100 } },
      { kept: 1, recoveryState: { state: "threw", startedAt: 100, endedAt: 700, code: "recovery.threw" } }
    ]);
    expect(JSON.stringify(saved)).not.toContain("private");
  });

  it("still rethrows the recovery's own error when the `threw` marker cannot be saved", async () => {
    const failure = new Error("recovery broke");
    let calls = 0;
    const result = annotateAutomationStudioRunDetailWithRecoveryState({
      detail: detail("failed"),
      recovering: true,
      annotate: async () => { throw failure; },
      saveFlowRunDetail: async () => { calls += 1; if (calls === 2) throw new Error("disk full"); },
      now: clock(1)
    });

    await expect(result).rejects.toBe(failure);
  });

  it("still runs the recovery when the `running` marker cannot be saved", async () => {
    const annotate = vi.fn(async (value: AutomationStudioFlowRunDetail) => value);
    const result = await annotateAutomationStudioRunDetailWithRecoveryState({
      detail: detail("failed"),
      recovering: true,
      annotate,
      saveFlowRunDetail: async () => { throw new Error("disk full"); },
      now: clock(5, 6)
    });

    expect(annotate).toHaveBeenCalledTimes(1);
    expect(result.metadata?.recoveryState).toEqual({ state: "ended", startedAt: 5, endedAt: 6 });
  });

  it.each([
    ["a run that did not fail", "succeeded", true],
    ["a failed run with no recovery context", "failed", false]
  ] as const)("marks nothing for %s", async (_label, status, recovering) => {
    const saveFlowRunDetail = vi.fn(async () => undefined);
    const annotated = detail(status, { annotated: true });
    const result = await annotateAutomationStudioRunDetailWithRecoveryState({ detail: detail(status), recovering, annotate: async () => annotated, saveFlowRunDetail });

    expect(result).toBe(annotated);
    expect(saveFlowRunDetail).not.toHaveBeenCalled();
  });
});
