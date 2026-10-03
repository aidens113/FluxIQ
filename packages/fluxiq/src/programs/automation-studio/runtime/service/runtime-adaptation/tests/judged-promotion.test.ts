import { describe, expect, it } from "vitest";
import { createBlankAutomationStudioFlowArtifact, type AutomationStudioFlowAdaptation, type AutomationStudioFlowRunDetail, type AutomationStudioRuntimeSession } from "../../../../model/index.ts";
import {
  automationStudioAwaitsJudgedRun,
  automationStudioJudgedPromotionCandidate,
  automationStudioJudgedPromotionOutcome,
  automationStudioRunAdaptationIds,
  settleAutomationStudioJudgedPromotions,
  settleAutomationStudioRunJudgedPromotions
} from "../judged-promotion.ts";
import { AutomationStudioProjectStoreUnavailableError } from "../../../../storage/index.ts";

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

  // t249 follow-up: a run parked on a person is settled, not left pending. No
  // Core path continues a parked run on the candidate, so the settle is final.
  it("settles a parked run's patch unapplied, and leaves one still running untouched", () => {
    expect(automationStudioJudgedPromotionOutcome(session("waiting"), true)).toEqual({ apply: false, reason: "run_parked" });
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

  it("settles the patch of a run parked on a person as unapplied, on the adaptation and the receipt", async () => {
    const { settled, stored, applied } = await settle({ session: session("waiting"), ran: true });

    expect(applied).toEqual([]);
    expect(stored.get("a.1")?.metadata?.approvalDecision).toMatchObject({ applied: false, notAppliedReason: "run_parked", judgedRunId: RUN_ID });
    expect((settled.metadata?.runtimePatchAttempts as Array<Record<string, unknown>>)[0]?.approvalDecision).toMatchObject({ notAppliedReason: "run_parked" });
  });

  it("changes nothing while the run is still running", async () => {
    const { settled, stored } = await settle({ session: session("running"), ran: true });

    expect(stored.get("a.1")?.metadata?.approvalDecision).toEqual(pending);
    expect((settled.metadata?.runtimePatchAttempts as Array<Record<string, unknown>>)[0]?.approvalDecision).toEqual(pending);
  });

  it("settles every pending patch of a run that threw as errored, whatever its session last said", async () => {
    const stored = new Map([["a.1", adaptation("a.1")]]);
    const settled = await settleAutomationStudioJudgedPromotions({
      ports: {
        getFlowAdaptation: async (_projectId, _flowId, id) => stored.get(id) ?? null,
        saveFlowAdaptation: async (saved) => { stored.set(saved.adaptationId, saved); return saved; },
        applyFlowAdaptation: async () => { throw new Error("not reached"); }
      },
      projectId: "project.judged",
      flowId: "flow.judged",
      session: session("running"),
      detail: { adaptationIds: ["a.1"], metadata: { runtimePatchAttempts: [{ adaptationId: "a.1", approvalDecision: pending, completedTrace: { status: "succeeded", attempts: [] } }] } } as unknown as AutomationStudioFlowRunDetail,
      reason: "run_errored"
    });

    expect(stored.get("a.1")?.metadata?.approvalDecision).toMatchObject({ applied: false, notAppliedReason: "run_errored" });
    const receipt = (settled.metadata?.runtimePatchAttempts as Array<Record<string, unknown>>)[0];
    expect(receipt?.approvalDecision).toMatchObject({ notAppliedReason: "run_errored" });
    expect(receipt).not.toHaveProperty("completedTrace");
  });
});

// t258: the record is read only for a run whose context could hold a patch for
// its judged end. A deterministic run whose project store could not be opened
// threw "pool is closing" from this read in place of ending failed. A run that
// could hold one, and whose store went away, notes that on its session -- kept
// outside the store -- and leaves the patch unapplied, rather than throwing.
describe("settling a run that has ended, from its stored record", () => {
  type Gone = "read" | "adaptation" | "save_adaptation" | "apply" | "save_record";
  const unavailable = () => new AutomationStudioProjectStoreUnavailableError("Automation Studio project database pool is closing.");

  async function settleRun(options: { context: { behavior: { promoteAdaptations: boolean } } | null; reason?: "run_errored"; gone?: Gone; other?: boolean; ended?: AutomationStudioRuntimeSession }) {
    const reads: string[] = [];
    const saves: AutomationStudioFlowRunDetail[] = [];
    const written: AutomationStudioRuntimeSession[] = [];
    const applied: string[] = [];
    const stored = new Map([["a.1", adaptation("a.1")]]);
    const fail = (step: Gone) => { if (options.gone === step) throw options.other ? new Error("constraint failed") : unavailable(); };
    const ended = options.ended ?? { ...session("failed"), projectId: "project.judged", flowId: "flow.judged" } as AutomationStudioRuntimeSession;
    const run = async () => await settleAutomationStudioRunJudgedPromotions({
      ports: {
        getFlowRunDetail: async (_projectId, runId) => {
          reads.push(runId);
          if (!options.context?.behavior.promoteAdaptations) throw unavailable();
          fail("read");
          return { adaptationIds: ["a.1"], metadata: { runtimePatchAttempts: [{ adaptationId: "a.1", approvalDecision: pending }], adaptiveRetry: { candidateAdaptationIds: ["a.1"] } } } as unknown as AutomationStudioFlowRunDetail;
        },
        saveFlowRunDetail: async (detail) => { fail("save_record"); saves.push(detail); return detail; },
        writeRuntimeSession: async (_projectId, noted) => { written.push(noted); },
        getFlowAdaptation: async (_projectId, _flowId, id) => { fail("adaptation"); return stored.get(id) ?? null; },
        saveFlowAdaptation: async (saved) => { fail("save_adaptation"); stored.set(saved.adaptationId, saved); return saved; },
        applyFlowAdaptation: async (request) => { applied.push(request.adaptationId); fail("apply"); return { ...stored.get(request.adaptationId)!, status: "applied" }; }
      },
      projectId: "project.judged",
      flowId: "flow.judged",
      context: options.context as never,
      session: ended,
      ...(options.reason ? { reason: options.reason } : {})
    });
    return { run, ended, reads, saves, written, applied, stored };
  }

  it("reads nothing for a run whose context cannot promote, judged or thrown, so an unreadable store cannot make it throw", async () => {
    for (const context of [null, { behavior: { promoteAdaptations: false } }]) {
      for (const reason of [undefined, "run_errored" as const]) {
        const { run, ended, reads, saves, written, stored } = await settleRun({ context, ...(reason ? { reason } : {}) });
        await expect(run()).resolves.toBe(ended);
        expect(reads).toEqual([]);
        expect(saves).toEqual([]);
        expect(written).toEqual([]);
        expect(stored.get("a.1")?.metadata?.approvalDecision).toEqual(pending);
      }
    }
  });

  it("reads, settles and saves the record of a run whose context could hold a patch, and notes nothing", async () => {
    const { run, ended, reads, saves, written, stored } = await settleRun({ context: { behavior: { promoteAdaptations: true } } });

    await expect(run()).resolves.toBe(ended);
    expect(reads).toEqual([RUN_ID]);
    expect(stored.get("a.1")?.metadata?.approvalDecision).toMatchObject({ applied: false, notAppliedReason: "run_failed", judgedRunId: RUN_ID });
    expect(saves).toHaveLength(1);
    expect(written).toEqual([]);
  });

  it("notes a record it could not read on the session, applies nothing, and leaves the patch held", async () => {
    const { run, written, applied, stored } = await settleRun({ context: { behavior: { promoteAdaptations: true } }, gone: "read" });

    const returned = await run();
    expect(returned.status).toBe("failed");
    expect(returned.metadata?.judgedPromotionSettlement).toMatchObject({ status: "store_unavailable", step: "read_record", recordSaved: false, adaptations: [], reason: "Automation Studio project database pool is closing." });
    expect(written).toEqual([returned]);
    expect(applied).toEqual([]);
    expect(stored.get("a.1")?.metadata?.approvalDecision).toEqual(pending);
  });

  it.each(["adaptation", "save_adaptation"] as const)("leaves a patch the store could not take (%s) unapplied for the store, on its receipt and the session", async (gone) => {
    const { run, saves, written, applied, stored } = await settleRun({ context: { behavior: { promoteAdaptations: true } }, gone });

    const returned = await run();
    expect(applied).toEqual([]);
    expect(stored.get("a.1")?.metadata?.approvalDecision).toEqual(pending);
    expect((saves[0]?.metadata?.runtimePatchAttempts as Array<Record<string, unknown>>)[0]?.approvalDecision).toMatchObject({ applied: false, notAppliedReason: "store_unavailable", judgedRunId: RUN_ID });
    expect(returned.metadata?.judgedPromotionSettlement).toMatchObject({ status: "store_unavailable", step: "settle", recordSaved: true, adaptations: [{ adaptationId: "a.1", applied: false, notAppliedReason: "store_unavailable" }] });
    expect(written).toEqual([returned]);
  });

  it("calls an apply the store went away under unapplied for the store, not refused by the gates", async () => {
    const answered = { ...session("succeeded", { performed: true, verdict: "answers" }), projectId: "project.judged", flowId: "flow.judged" } as AutomationStudioRuntimeSession;
    const { run, saves, applied } = await settleRun({ context: { behavior: { promoteAdaptations: true } }, gone: "apply", ended: answered });

    const returned = await run();
    expect(applied).toEqual(["a.1"]);
    expect((saves[0]?.metadata?.runtimePatchAttempts as Array<Record<string, unknown>>)[0]?.approvalDecision).toMatchObject({ applied: false, notAppliedReason: "store_unavailable", autoApplyFailed: true });
    expect(returned.metadata?.judgedPromotionSettlement).toMatchObject({ step: "settle", adaptations: [{ adaptationId: "a.1", notAppliedReason: "store_unavailable" }] });
  });

  it("notes what was decided when the record could not be saved", async () => {
    const { run, written, stored } = await settleRun({ context: { behavior: { promoteAdaptations: true } }, gone: "save_record" });

    const returned = await run();
    expect(stored.get("a.1")?.metadata?.approvalDecision).toMatchObject({ notAppliedReason: "run_failed" });
    expect(returned.metadata?.judgedPromotionSettlement).toMatchObject({ step: "save_record", recordSaved: false, adaptations: [{ adaptationId: "a.1", applied: false, notAppliedReason: "run_failed" }] });
    expect(written).toEqual([returned]);
  });

  it("still throws a store that answered with an error, which is not the store going away", async () => {
    for (const gone of ["read", "adaptation", "save_record"] as const) {
      const { run, written } = await settleRun({ context: { behavior: { promoteAdaptations: true } }, gone, other: true });
      await expect(run()).rejects.toThrow("constraint failed");
      expect(written).toEqual([]);
    }
  });
});
