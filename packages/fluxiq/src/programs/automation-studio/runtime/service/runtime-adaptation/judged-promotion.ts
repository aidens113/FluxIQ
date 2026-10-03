// A runtime patch is kept only after a whole run that ran it was judged to
// answer (user, 2026-10-02: the repair loop "must test the entire flow & have
// that judged success at least one time").
//
// **The order, as built.** A run starts at the Flow's start and fails at a
// step. The patch ladder writes a patch and trials it from the changed node
// (`../../live-patch.ts`). The promotion gate decides whether the patch may be
// applied without a person (`./runtime-promotion.ts`); where it may, nothing is
// applied yet -- the decision is recorded with `applyAt: "judged_whole_run"` and
// `applied: false`. The run then goes on on the *unapplied candidate*: the
// stored Flow with every pending patch of this run written onto it in memory
// (`automationStudioJudgedPromotionCandidate`, in `./repair-rerun.ts`).
//
// - **The resume.** It keeps the run's id and picks up at the trial's resume
//   point, so the run that is judged went from the Flow's start, through the
//   patched step, to its end.
// - **A trial that ran the Flow to its end.** That run, too, began at the
//   Flow's start and finished on the candidate: the trial's own pass is adopted
//   as the resumed pass, with nothing run again (`./repair-rerun.ts`).
// - **A patch the refuted result's repair wrote.** No step failed, so there is
//   nowhere to resume: the Flow is run again from its start on the candidate,
//   the same whole-Flow re-run a re-authored Flow takes.
//
// Each pass records the patches it ran (`candidateAdaptationIds`). The run's
// result is judged, and only then does the service settle each pending patch
// (`settleAutomationStudioRunJudgedPromotions`): applied to the stored Flow when
// the run ended `succeeded` with a performed verdict of `answers` and a pass ran
// the patch, otherwise left unapplied with the reason on both the adaptation and
// the run's own receipt. A patch a pass ran is settled before the next pass
// starts, so a later pass's verdict never stands for an earlier pass's patch.
//
// **Reasons a patch stays unapplied.** `not_rerun`: no pass ran it (the resume
// was declined, or the Flow was re-authored before it ran). `run_cancelled`.
// `run_failed`: the pass that ran it did not finish. `refuted`: it finished and
// its result was not judged to answer. `not_judged`: it finished and nothing
// judged it. `run_parked`: the run stopped waiting on a person; no Core path
// continues a parked run on the candidate, so the settle is final.
// `run_errored`: the run threw. `apply_failed`: judged to answer, and the apply
// itself refused. An unapplied adaptation keeps its trial evidence and stays
// reviewable; a person can still apply it through review.

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowAdaptation, AutomationStudioFlowArtifact, AutomationStudioFlowRunDetail, AutomationStudioRuntimeSession } from "../../../model/index.ts";
import { automationStudioDecisionAwaitsJudgedRun, automationStudioRunCandidateAdaptationIds } from "../../durable-behavior/index.ts";
import { automationStudioGraphFlowWithAdaptationPatch } from "../adaptations/index.ts";
import { compactJsonObject } from "../compact-json.ts";
import { isJsonRecord } from "../json-values.ts";

export type AutomationStudioJudgedPromotionReason = "not_rerun" | "run_cancelled" | "run_failed" | "refuted" | "not_judged" | "run_parked" | "run_errored" | "apply_failed";

/** What settling one pending patch comes to: applied, unapplied with a reason, or still waiting on a run that has not finished. */
export type AutomationStudioJudgedPromotionOutcome = { apply: true } | { apply: false; reason: AutomationStudioJudgedPromotionReason } | { waiting: true };

export type AutomationStudioJudgedPromotionPorts = {
  getFlowAdaptation(projectId: string, flowId: string, adaptationId: string): Promise<AutomationStudioFlowAdaptation | null>;
  saveFlowAdaptation(adaptation: AutomationStudioFlowAdaptation): Promise<AutomationStudioFlowAdaptation>;
  /** The apply, through review, so the promotion gates run on it as on any apply. */
  applyFlowAdaptation(input: { projectId: string; flowId: string; adaptationId: string; reason: string }): Promise<AutomationStudioFlowAdaptation>;
};

/**
 * Every adaptation this run recorded: its `adaptationIds`, and the ids on its
 * `runtimePatchAttempts` receipts. Both, because a later recovery of the same
 * run -- the patch ladder after a refuted result -- writes the receipts afresh,
 * and a patch whose receipt it dropped still has to be settled.
 */
export function automationStudioRunAdaptationIds(detail: Pick<AutomationStudioFlowRunDetail, "adaptationIds" | "metadata">): string[] {
  const attempts = Array.isArray(detail.metadata?.runtimePatchAttempts) ? detail.metadata.runtimePatchAttempts.filter(isJsonRecord) : [];
  const fromReceipts = attempts.flatMap((attempt) => (typeof attempt.adaptationId === "string" ? [attempt.adaptationId] : []));
  return [...new Set([...(detail.adaptationIds ?? []), ...fromReceipts])];
}

/**
 * Whether this adaptation's promotion is still waiting for the judged end of
 * run `runId`: allowed unattended, held, and not yet settled.
 */
export function automationStudioAwaitsJudgedRun(adaptation: Pick<AutomationStudioFlowAdaptation, "metadata">, runId: string): boolean {
  return automationStudioDecisionAwaitsJudgedRun(adaptation.metadata?.approvalDecision, runId);
}

/**
 * The candidate a pass runs: the stored graph Flow with every pending
 * adaptation of its graph written onto it, unsaved, by the function an apply
 * uses. A patch with no durable form (`edit_recovery`) changes nothing here,
 * as its apply will be refused and recorded. Throws for a patch it cannot write.
 */
export function automationStudioJudgedPromotionCandidate(input: {
  flow: AutomationStudioFlowArtifact;
  adaptations: readonly AutomationStudioFlowAdaptation[];
  subflowId?: string | undefined;
}): { flow: AutomationStudioFlowArtifact; adaptationIds: string[] } {
  let flow = input.flow;
  const adaptationIds: string[] = [];
  for (const adaptation of input.adaptations) {
    if ((adaptation.subflowId || undefined) !== (input.subflowId || undefined)) continue;
    for (const patch of adaptation.patch) {
      if (patch.kind !== "edit_recovery") flow = automationStudioGraphFlowWithAdaptationPatch(flow, adaptation, patch, input.flow.updatedAt);
    }
    adaptationIds.push(adaptation.adaptationId);
  }
  return { flow, adaptationIds };
}

/**
 * What a finished run comes to for one pending patch. `ranIt` says whether a
 * pass of this run ran the patch as part of its candidate.
 */
export function automationStudioJudgedPromotionOutcome(session: Pick<AutomationStudioRuntimeSession, "status" | "metadata">, ranIt: boolean): AutomationStudioJudgedPromotionOutcome {
  if (session.status === "cancelled") return { apply: false, reason: "run_cancelled" };
  if (session.status === "waiting") return { apply: false, reason: "run_parked" };
  if (session.status !== "succeeded" && session.status !== "failed") return { waiting: true };
  if (!ranIt) return { apply: false, reason: "not_rerun" };
  const verification = isJsonRecord(session.metadata?.resultVerification) ? session.metadata.resultVerification : undefined;
  if (verification?.performed === true && verification.verdict !== "answers") return { apply: false, reason: "refuted" };
  if (session.status !== "succeeded") return { apply: false, reason: "run_failed" };
  if (verification?.performed !== true) return { apply: false, reason: "not_judged" };
  return { apply: true };
}

/**
 * Settles the pending patches of this run against how `session` ended, and
 * answers `detail` with its receipts saying so. The caller saves the detail it
 * is handed back. Each adaptation is written as it is settled.
 *
 * `only: "ran"` settles just the patches a pass already ran -- before a new
 * pass starts, whose verdict must not stand for them. `reason` settles every
 * pending patch unapplied with it, whatever the session says: a run that threw.
 */
export async function settleAutomationStudioJudgedPromotions(input: {
  ports: AutomationStudioJudgedPromotionPorts;
  projectId: string;
  flowId: string;
  session: Pick<AutomationStudioRuntimeSession, "runId" | "status" | "metadata">;
  detail: AutomationStudioFlowRunDetail;
  only?: "ran" | undefined;
  reason?: AutomationStudioJudgedPromotionReason | undefined;
}): Promise<AutomationStudioFlowRunDetail> {
  const recorded = automationStudioRunAdaptationIds(input.detail);
  if (!recorded.length) return input.detail;
  if (!input.reason && "waiting" in automationStudioJudgedPromotionOutcome(input.session, false)) return input.detail;
  const ran = new Set(automationStudioRunCandidateAdaptationIds(input.detail));
  const settled = new Map<string, JsonObject>();
  for (const adaptationId of recorded) {
    if (input.only === "ran" && !ran.has(adaptationId)) continue;
    const adaptation = await input.ports.getFlowAdaptation(input.projectId, input.flowId, adaptationId);
    if (!adaptation) continue;
    const decision = isJsonRecord(adaptation.metadata?.approvalDecision) ? adaptation.metadata.approvalDecision : {};
    if (!automationStudioAwaitsJudgedRun(adaptation, input.session.runId)) {
      // Settled for this run already -- a receipt write that did not land -- is mirrored, never applied twice.
      if (decision.settledAt !== undefined && decision.judgedRunId === input.session.runId) settled.set(adaptationId, decision);
      continue;
    }
    const outcome: AutomationStudioJudgedPromotionOutcome = input.reason ? { apply: false, reason: input.reason } : automationStudioJudgedPromotionOutcome(input.session, ran.has(adaptationId));
    if ("waiting" in outcome) continue;
    settled.set(adaptationId, await settleOne(input, adaptation, decision, outcome));
  }
  if (!settled.size) return input.detail;
  const attempts = Array.isArray(input.detail.metadata?.runtimePatchAttempts) ? input.detail.metadata.runtimePatchAttempts : [];
  return {
    ...input.detail,
    metadata: {
      ...(input.detail.metadata ?? {}),
      runtimePatchAttempts: attempts.map((attempt) => {
        if (!isJsonRecord(attempt) || typeof attempt.adaptationId !== "string") return attempt;
        const decision = settled.get(attempt.adaptationId);
        if (!decision) return attempt;
        // A trial's own pass rides on its receipt only until a pass adopts it (`./repair-rerun.ts`).
        const { completedTrace: _adoptedOrNot, ...kept } = attempt;
        return { ...kept, approvalDecision: decision };
      })
    }
  };
}

/**
 * The same, for a run that has ended: its stored record is read, settled, and
 * saved. `reason` is for a run that threw, whose session cannot say why.
 */
export async function settleAutomationStudioRunJudgedPromotions(input: {
  ports: AutomationStudioJudgedPromotionPorts & {
    getFlowRunDetail(projectId: string, runId: string): Promise<AutomationStudioFlowRunDetail | null>;
    saveFlowRunDetail(detail: AutomationStudioFlowRunDetail): Promise<unknown>;
  };
  projectId: string;
  flowId: string | undefined;
  session: AutomationStudioRuntimeSession;
  reason?: AutomationStudioJudgedPromotionReason | undefined;
}): Promise<AutomationStudioRuntimeSession> {
  if (!input.flowId) return input.session;
  const detail = await input.ports.getFlowRunDetail(input.projectId, input.session.runId);
  if (!detail) return input.session;
  const settled = await settleAutomationStudioJudgedPromotions({ ports: input.ports, projectId: input.projectId, flowId: input.flowId, session: input.session, detail, ...(input.reason ? { reason: input.reason } : {}) });
  if (settled !== detail) await input.ports.saveFlowRunDetail(settled);
  return input.session;
}

async function settleOne(
  input: { ports: AutomationStudioJudgedPromotionPorts; projectId: string; flowId: string; session: Pick<AutomationStudioRuntimeSession, "runId"> },
  adaptation: AutomationStudioFlowAdaptation,
  decision: JsonObject,
  outcome: Exclude<AutomationStudioJudgedPromotionOutcome, { waiting: true }>
): Promise<JsonObject> {
  const base = { ...decision, judgedRunId: input.session.runId, settledAt: Date.now() };
  if (!outcome.apply) {
    const unapplied = compactJsonObject({ ...base, applied: false, notAppliedReason: outcome.reason });
    await input.ports.saveFlowAdaptation(withDecision(adaptation, unapplied));
    return unapplied;
  }
  // Recorded before the apply, which reads the stored adaptation and keeps its
  // metadata, so the applied record carries the decision that applied it.
  const recorded = compactJsonObject({ ...base, applied: true });
  const saved = await input.ports.saveFlowAdaptation(withDecision(adaptation, recorded));
  try {
    await input.ports.applyFlowAdaptation({
      projectId: input.projectId,
      flowId: input.flowId,
      adaptationId: adaptation.adaptationId,
      reason: "A whole run from the Flow's start ran this change and its result was judged to answer the request."
    });
    return recorded;
  } catch (error) {
    const refused = compactJsonObject({ ...base, applied: false, notAppliedReason: "apply_failed", autoApplyFailed: true, error: error instanceof Error ? error.message : String(error) });
    await input.ports.saveFlowAdaptation(withDecision(saved, refused));
    return refused;
  }
}

function withDecision(adaptation: AutomationStudioFlowAdaptation, approvalDecision: JsonObject): AutomationStudioFlowAdaptation {
  return { ...adaptation, updatedAt: Date.now(), metadata: { ...(adaptation.metadata ?? {}), approvalDecision } };
}
