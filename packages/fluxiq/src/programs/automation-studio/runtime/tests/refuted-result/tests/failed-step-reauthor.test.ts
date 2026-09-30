// The failed-step re-author, as the run reaches it: the verification is handed
// a run that failed at a step, the ladder has already ended with nothing
// executed, and the Flow is re-authored, applied and run again -- and the re-run
// is judged like any other (t193-wK cause C2). Before this the verification
// returned a failed run at its first line and nothing followed.
import { describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowInstruction, AutomationStudioFlowRunDetail } from "../../../../model/index.ts";
import { AUTOMATION_STUDIO_RESULT_REAUTHOR_METADATA_KEY } from "../../../recovery/refuted-result/index.ts";
import { verifyAutomationStudioRuntimeSessionResult, type AutomationStudioResultVerificationPorts } from "../../../result-verification/index.ts";
import { ANSWER, flow, harness, runDetail, session } from "../../../result-verification/tests/run-outcome-harness.ts";
import { automationStudioStepFailureRepairPort } from "../../../service/runtime-adaptation/index.ts";

/** Step `n2` failed `target_ambiguous`; the ladder ran and ended as `metadata` says. */
function ladderEnded(metadata: JsonObject): AutomationStudioFlowRunDetail {
  const base = runDetail();
  return {
    ...base,
    summary: { ...base.summary, status: "failed" },
    actionAttempts: [
      { attemptId: "attempt.1", nodeId: "n1", definitionId: "builtin.navigate", order: 1, status: "succeeded", startedAt: 1 },
      { attemptId: "attempt.2", nodeId: "n2", definitionId: "builtin.policy.action", order: 2, status: "failed", startedAt: 2, failure: { category: "target_ambiguous", code: "target.ambiguous", retryable: true, stage: "target_resolution" } }
    ],
    metadata: { llmGate: { invoked: true, costAccounting: { calls: 2, estimatedCostUsd: 0.01 }, diagnostics: [] }, ...metadata }
  };
}

function wired(detail: AutomationStudioFlowRunDetail, rerunStatus: "succeeded" | "failed" = "succeeded") {
  const context = harness({ answer: ANSWER.yes });
  const generate = vi.fn(async () => ({ adaptationId: "adaptation.bootstrap.1", accounting: { estimatedCostUsd: 0.03 } }));
  const approve = vi.fn(async () => undefined);
  const apply = vi.fn(async () => undefined);
  const reruns: AutomationStudioFlowRunDetail[] = [];
  const ports: AutomationStudioResultVerificationPorts = {
    ...context.ports,
    // A store that keeps what each pass saved, as the run store does.
    getFlowRunDetail: async () => context.saved.at(-1) ?? detail,
    repairFailedStep: automationStudioStepFailureRepairPort({
      projectId: "project-1", flowId: () => "flow-1", now: () => 0,
      caller: { actorUserId: "user-1", actorSessionId: "session-1" },
      generate: generate as never, approve, apply
    }),
    rerunRepairedFlow: async (request) => {
      reruns.push(request.detail);
      return { session: session({ status: rerunStatus }) };
    }
  };
  return { ...context, ports, generate, approve, apply, reruns };
}

describe("a run that failed at a step the ladder could not repair", () => {
  it("is re-authored in extend mode, approved, applied, re-run, and the re-run judged", async () => {
    const context = wired(ladderEnded({ llmGate: { invoked: true, costAccounting: { calls: 2, estimatedCostUsd: 0.01 }, patchSkippedCode: "llm.runtime_patch_goal_unachievable", diagnostics: [] } }));
    const next = await verifyAutomationStudioRuntimeSessionResult({ ports: context.ports, projectId: "project-1", session: session({ status: "failed" }), flow });

    expect(context.generate).toHaveBeenCalledTimes(1);
    expect((context.generate.mock.calls[0] as unknown[])[0]).toMatchObject({ projectId: "project-1", flowId: "flow-1", mode: "extend", evidenceGuided: true });
    expect(((context.generate.mock.calls[0] as unknown[])[1] as AutomationStudioFlowInstruction).body).toContain("step n2");
    expect(context.approve).toHaveBeenCalledTimes(1);
    expect(context.apply).toHaveBeenCalledTimes(1);
    expect(context.reruns).toHaveLength(1);
    // The attempt is on the run before it is re-run, so a re-run that throws still leaves it.
    expect(context.reruns[0]?.metadata?.[AUTOMATION_STUDIO_RESULT_REAUTHOR_METADATA_KEY]).toMatchObject({ routed: true, applied: true });
    // The corrected Flow ran and was judged: the caller is handed that run.
    expect(next.status).toBe("succeeded");
    expect((next.metadata?.resultVerification as JsonObject).status).toBe("confirmed");
  });

  it("is re-authored when the domain refused the ladder's target override", async () => {
    const context = wired(ladderEnded({ runtimePatchAttempts: [{ kind: "temporary_target_override", executed: false, preflightOk: false, targetOverrideRefusal: { status: "refused", reason: "target_indistinguishable" } }] }));
    await verifyAutomationStudioRuntimeSessionResult({ ports: context.ports, projectId: "project-1", session: session({ status: "failed" }), flow });
    expect(context.generate).toHaveBeenCalledTimes(1);
    expect(context.reruns).toHaveLength(1);
  });

  it("re-authors once: a re-run that fails at a step again is handed back failed", async () => {
    const context = wired(ladderEnded({ llmGate: { invoked: true, patchSkippedCode: "llm.runtime_patch_diagnosis_asked_for_none", diagnostics: [] } }), "failed");
    const next = await verifyAutomationStudioRuntimeSessionResult({ ports: context.ports, projectId: "project-1", session: session({ status: "failed" }), flow });
    expect(context.generate).toHaveBeenCalledTimes(1);
    expect(context.reruns).toHaveLength(1);
    expect(next.status).toBe("failed");
  });

  it("leaves a run whose ladder patch executed exactly as it was", async () => {
    const context = wired(ladderEnded({ runtimePatchAttempts: [{ kind: "temporary_target_override", executed: true, preflightOk: true }] }));
    const failed = session({ status: "failed" });
    const next = await verifyAutomationStudioRuntimeSessionResult({ ports: context.ports, projectId: "project-1", session: failed, flow });
    expect(context.generate).not.toHaveBeenCalled();
    expect(context.reruns).toHaveLength(0);
    expect(context.saved).toHaveLength(0);
    expect(next).toBe(failed);
  });

  it("does not re-run a re-author that built nothing", async () => {
    const context = wired(ladderEnded({ llmGate: { invoked: true, costAccounting: { calls: 12, estimatedCostUsd: 0.25 }, patchSkippedCode: "llm.runtime_patch_goal_unachievable", diagnostics: [] } }));
    const next = await verifyAutomationStudioRuntimeSessionResult({ ports: context.ports, projectId: "project-1", session: session({ status: "failed" }), flow });
    expect(context.generate).not.toHaveBeenCalled();
    expect(context.reruns).toHaveLength(0);
    expect(context.saved.at(-1)?.metadata?.[AUTOMATION_STUDIO_RESULT_REAUTHOR_METADATA_KEY]).toMatchObject({ code: "llm_budget.run_cost_limit" });
    expect(next.status).toBe("failed");
  });
});
