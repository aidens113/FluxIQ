import { describe, expect, it } from "vitest";
import { createBlankAutomationStudioFlowArtifact, type AutomationStudioFlowAdaptation, type AutomationStudioFlowRunDetail, type AutomationStudioRuntimeSession } from "../../../../model/index.ts";
import {
  automationStudioAwaitsJudgedRun,
  automationStudioJudgedPromotionCandidate,
  automationStudioJudgedPromotionOutcome,
  automationStudioRunAdaptationIds,
  settleAutomationStudioJudgedPromotions
} from "../judged-promotion.ts";

// The rule a runtime patch is kept by (t249): applied only once a whole run
// that ran it ended `succeeded` with a performed verdict of `answers`.

const RUN_ID = "run.judged";
const pending = { autoApply: true, applyAt: "judged_whole_run", applied: false, runId: RUN_ID };

function adaptation(id: string, overrides: Partial<AutomationStudioFlowAdaptation> = {}): AutomationStudioFlowAdaptation {
  return {
    schemaVersion: "0.1",
    adaptationId: id,
    flowId: "flow.judged",
    projectId: "project.judged",
    sourceRunId: RUN_ID,
    trigger: "Runtime patch temporary_wait_retry restored expected state.",
    patch: [{ kind: "edit_expectation", targetId: "wait", summary: "Wait longer.", after: { timeoutMs: 500 } }],
    status: "validated",
    author: "runtime",
    riskLevel: "low",
    createdAt: 1,
    updatedAt: 1,
    metadata: { approvalDecision: pending },
    ...overrides
  };
}

function session(status: AutomationStudioRuntimeSession["status"], resultVerification?: Record<string, unknown>): Pick<AutomationStudioRuntimeSession, "runId" | "status" | "metadata"> {
  return { runId: RUN_ID, status, ...(resultVerification ? { metadata: { resultVerification } } : {}) } as Pick<AutomationStudioRuntimeSession, "runId" | "status" | "metadata">;
}

describe("what a finished run comes to for a pending patch", () => {
  it("applies only on a succeeded run judged to answer, which ran the patch", () => {
    expect(automationStudioJudgedPromotionOutcome(session("succeeded", { performed: true, verdict: "answers" }), true)).toEqual({ apply: true });
  });

  it("names why it does not apply, for every other ending", () => {
    expect(automationStudioJudgedPromotionOutcome(session("succeeded", { performed: true, verdict: "answers" }), false)).toEqual({ apply: false, reason: "not_rerun" });
    expect(automationStudioJudgedPromotionOutcome(session("failed", { performed: true, verdict: "does_not_answer" }), true)).toEqual({ apply: false, reason: "refuted" });
    // Two judgements that did not agree leave the run `succeeded` and the result unconfirmed: not an answer.
    expect(automationStudioJudgedPromotionOutcome(session("succeeded", { performed: true, verdict: "unsure", basis: "model_disagreed" }), true)).toEqual({ apply: false, reason: "refuted" });
    expect(automationStudioJudgedPromotionOutcome(session("failed"), true)).toEqual({ apply: false, reason: "run_failed" });
    expect(automationStudioJudgedPromotionOutcome(session("succeeded", { performed: false, code: "core.result.no_model_available" }), true)).toEqual({ apply: false, reason: "not_judged" });
    expect(automationStudioJudgedPromotionOutcome(session("succeeded"), true)).toEqual({ apply: false, reason: "not_judged" });
    expect(automationStudioJudgedPromotionOutcome(session("cancelled"), true)).toEqual({ apply: false, reason: "run_cancelled" });
  });

  it("leaves a patch waiting while its run has not finished", () => {
    expect(automationStudioJudgedPromotionOutcome(session("waiting"), true)).toEqual({ waiting: true });
    expect(automationStudioJudgedPromotionOutcome(session("running"), true)).toEqual({ waiting: true });
  });
});

describe("which adaptations a run is waiting on", () => {
  it("reads the run's adaptation ids and its receipts both", () => {
    const detail = { adaptationIds: ["a.1"], metadata: { runtimePatchAttempts: [{ adaptationId: "a.2" }, { adaptationId: "a.1" }, { kind: "no_repair" }] } } as Pick<AutomationStudioFlowRunDetail, "adaptationIds" | "metadata">;
    expect(automationStudioRunAdaptationIds(detail)).toEqual(["a.1", "a.2"]);
  });

  it("waits only on a held, unsettled decision of this run", () => {
    expect(automationStudioAwaitsJudgedRun(adaptation("a"), RUN_ID)).toBe(true);
    expect(automationStudioAwaitsJudgedRun(adaptation("a"), "run.other")).toBe(false);
    expect(automationStudioAwaitsJudgedRun(adaptation("a", { metadata: { approvalDecision: { ...pending, settledAt: 5 } } }), RUN_ID)).toBe(false);
    expect(automationStudioAwaitsJudgedRun(adaptation("a", { metadata: { approvalDecision: { autoApply: false, requiresManualApproval: true } } }), RUN_ID)).toBe(false);
    // A decision from before t249 was applied when it was made, and waits on nothing.
    expect(automationStudioAwaitsJudgedRun(adaptation("a", { metadata: { approvalDecision: { autoApply: true } } }), RUN_ID)).toBe(false);
  });
});

describe("the candidate a resumed run runs", () => {
  const flow = {
    ...createBlankAutomationStudioFlowArtifact({ flowId: "flow.graph", projectId: "project.judged", name: "Graph", now: 7 }),
    nodes: [{ id: "wait", definitionId: "builtin.policy.expectation", parameterValues: { timeoutMs: 100 } }],
    edges: []
  };

  it("writes the pending patches of its graph, and nothing for a patch with no durable form", () => {
    const candidate = automationStudioJudgedPromotionCandidate({
      flow,
      adaptations: [
        adaptation("a.wait"),
        adaptation("a.sequence", { patch: [{ kind: "edit_recovery", targetId: "wait", summary: "Inserted steps." }] }),
        adaptation("a.elsewhere", { subflowId: "subflow.other" })
      ]
    });

    expect(candidate.adaptationIds).toEqual(["a.wait", "a.sequence"]);
    expect(candidate.flow.nodes[0]?.parameterValues).toEqual({ timeoutMs: 500 });
    expect(candidate.flow.updatedAt).toBe(flow.updatedAt);
    expect(flow.nodes[0]?.parameterValues).toEqual({ timeoutMs: 100 });
  });

  it("throws for a patch it cannot write onto the Flow", () => {
    expect(() => automationStudioJudgedPromotionCandidate({ flow, adaptations: [adaptation("a.gone", { patch: [{ kind: "edit_expectation", targetId: "gone", summary: "x", after: { timeoutMs: 1 } }] })] })).toThrow(/Unknown Flow node/u);
  });
});

describe("settling a run's pending patches", () => {
  async function settle(options: { session: ReturnType<typeof session>; ran?: boolean; applyFails?: boolean }) {
    const stored = new Map([["a.1", adaptation("a.1")]]);
    const applied: string[] = [];
    const detail = {
      adaptationIds: ["a.1"],
      metadata: {
        runtimePatchAttempts: [{ kind: "temporary_wait_retry", adaptationId: "a.1", approvalDecision: pending }],
        ...(options.ran ? { adaptiveRetry: { attempted: true, status: "succeeded", candidateAdaptationIds: ["a.1"] } } : {})
      }
    } as unknown as AutomationStudioFlowRunDetail;
    const settled = await settleAutomationStudioJudgedPromotions({
      ports: {
        getFlowAdaptation: async (_projectId, _flowId, id) => stored.get(id) ?? null,
        saveFlowAdaptation: async (saved) => { stored.set(saved.adaptationId, saved); return saved; },
        applyFlowAdaptation: async (request) => {
          applied.push(request.adaptationId);
          if (options.applyFails) throw new Error("Adaptation cannot be applied: destructive adaptations require manual proposal review");
          return { ...stored.get(request.adaptationId)!, status: "applied" };
        }
      },
      projectId: "project.judged",
      flowId: "flow.judged",
      session: options.session,
      detail
    });
    return { settled, stored, applied };
  }

  it("applies the patch once the run that ran it was judged to answer, recording the decision first", async () => {
    const { settled, stored, applied } = await settle({ session: session("succeeded", { performed: true, verdict: "answers" }), ran: true });

    expect(applied).toEqual(["a.1"]);
    expect(stored.get("a.1")?.metadata?.approvalDecision).toMatchObject({ applied: true, judgedRunId: RUN_ID, settledAt: expect.any(Number) });
    expect((settled.metadata?.runtimePatchAttempts as Array<Record<string, unknown>>)[0]?.approvalDecision).toMatchObject({ applied: true, judgedRunId: RUN_ID });
  });

  it("records an apply the gates refused, and leaves the patch unapplied", async () => {
    const { stored } = await settle({ session: session("succeeded", { performed: true, verdict: "answers" }), ran: true, applyFails: true });

    expect(stored.get("a.1")?.metadata?.approvalDecision).toMatchObject({ applied: false, notAppliedReason: "apply_failed", autoApplyFailed: true, error: expect.stringContaining("destructive") });
  });

  it("leaves the patch of a run that failed after resuming unapplied, and asks for no apply", async () => {
    const { stored, applied } = await settle({ session: session("failed"), ran: true });

    expect(stored.get("a.1")?.metadata?.approvalDecision).toMatchObject({ applied: false, notAppliedReason: "run_failed" });
    expect(applied).toEqual([]);
  });

  it("never settles twice: a patch already settled for this run is mirrored onto a receipt that missed it", async () => {
    const decided = { ...pending, applied: true, judgedRunId: RUN_ID, settledAt: 9 };
    const applied: string[] = [];
    const saved: string[] = [];
    const settled = await settleAutomationStudioJudgedPromotions({
      ports: {
        getFlowAdaptation: async () => adaptation("a.1", { status: "applied", metadata: { approvalDecision: decided } }),
        saveFlowAdaptation: async (adaptationSaved) => { saved.push(adaptationSaved.adaptationId); return adaptationSaved; },
        applyFlowAdaptation: async (request) => { applied.push(request.adaptationId); throw new Error("not reached"); }
      },
      projectId: "project.judged",
      flowId: "flow.judged",
      session: session("succeeded", { performed: true, verdict: "answers" }),
      detail: { adaptationIds: ["a.1"], metadata: { runtimePatchAttempts: [{ adaptationId: "a.1", approvalDecision: pending }] } } as unknown as AutomationStudioFlowRunDetail
    });

    expect(applied).toEqual([]);
    expect(saved).toEqual([]);
    expect((settled.metadata?.runtimePatchAttempts as Array<Record<string, unknown>>)[0]?.approvalDecision).toEqual(decided);
  });

  it("changes nothing while the run is still waiting on a person", async () => {
    const { settled, stored } = await settle({ session: session("waiting"), ran: true });

    expect(stored.get("a.1")?.metadata?.approvalDecision).toEqual(pending);
    expect((settled.metadata?.runtimePatchAttempts as Array<Record<string, unknown>>)[0]?.approvalDecision).toEqual(pending);
  });
});
