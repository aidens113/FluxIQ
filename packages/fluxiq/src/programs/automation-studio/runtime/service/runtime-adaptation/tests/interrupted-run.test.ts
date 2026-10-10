import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowRunDetail, AutomationStudioRuntimeSession } from "../../../../model/index.ts";
import { automationStudioJudgedPromotionOutcome } from "../judged-promotion.ts";
import { rerunAutomationStudioSessionAfterRepair, type AutomationStudioRepairRerunInput } from "../repair-rerun.ts";
import { isTerminalRuntimeSessionStatus } from "../../runtime-session/index.ts";

// A run its process left mid-flight is swept `interrupted` (C8). It is ended,
// it is not a success, and nothing repairs, re-runs or promotes from it: its
// last lasting act may have landed, so running it again could repeat it.

describe("an interrupted run", () => {
  it("is terminal", () => {
    expect(isTerminalRuntimeSessionStatus("interrupted")).toBe(true);
  });

  it("never promotes a patch, even with a verdict that answers, and is never left waiting", () => {
    const session = { runId: "run.interrupted", status: "interrupted", metadata: { resultVerification: { performed: true, verdict: "answers" } } } as Pick<AutomationStudioRuntimeSession, "status" | "metadata">;
    expect(automationStudioJudgedPromotionOutcome(session, true)).toEqual({ apply: false, reason: "run_failed" });
    expect(automationStudioJudgedPromotionOutcome(session, false)).toEqual({ apply: false, reason: "run_failed" });
  });

  it("is never re-run after a repair, and nothing is read or written for it", async () => {
    const touched: string[] = [];
    const ports = new Proxy({}, {
      get: (_target, name) => async () => {
        touched.push(String(name));
        throw new Error(`port ${String(name)} must not be called`);
      }
    });
    const result = await rerunAutomationStudioSessionAfterRepair({
      ports: ports as AutomationStudioRepairRerunInput["ports"],
      projectId: "project.interrupted",
      session: { schemaVersion: "0.1", runId: "run.interrupted", flowId: "flow.interrupted", status: "interrupted", queuedAt: 1, startedAt: 1, finishedAt: 2 } as AutomationStudioRuntimeSession,
      detail: {} as AutomationStudioFlowRunDetail,
      adaptationContext: {} as AutomationStudioRepairRerunInput["adaptationContext"],
      from: "start"
    });
    expect(result).toBeNull();
    expect(touched).toEqual([]);
  });
});
