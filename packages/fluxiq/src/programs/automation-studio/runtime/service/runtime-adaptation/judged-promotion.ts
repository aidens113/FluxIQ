// A runtime patch is kept only after a whole run that ran it was judged to
// answer (user, 2026-10-02: the repair loop "must test the entire flow & have
// that judged success at least one time").
//
// **The order, as built.** A run starts at the Flow's start and fails at a
// step. The patch ladder writes a patch and trials it from the changed node
// (`../../live-patch.ts`). The promotion gate decides whether the patch may be
// applied without a person (`./runtime-promotion.ts`); where it may, nothing is
// applied yet -- the decision is recorded with `applyAt: "judged_whole_run"` and
// `applied: false`. The run then resumes on the *unapplied candidate*: the
// stored Flow with every pending patch of this run written onto it in memory
// (`automationStudioJudgedPromotionCandidate`, in `./repair-rerun.ts`). The
// resumed run keeps the run's id, so the run that is judged went from the
// Flow's start, through the patched step, to its end. Its result is judged, and
// only then does the service settle the patch (`settleAutomationStudioRunJudgedPromotions`):
// applied to the stored Flow when the run ended `succeeded` with a performed
// verdict of `answers`, otherwise left unapplied with the reason on both the
// adaptation and the run's own receipt.
//
// **Why the trialling run is the judged whole run, and not a re-run from the
// start.** The trial and the resume continue one run, which began at the
// Flow's start; the steps before the patched one are the same in the candidate
// and the stored Flow, and the steps after it ran on the candidate. Running the
// Flow again from its start after applying would repeat every lasting effect
// the run already had (a charge, a submitted form), which is why the resume
// exists at all (`../adaptations/adaptive-retry.ts`). The re-run from the start
// that `./repair-rerun.ts` also performs follows a *re-authored* Flow, never a
// runtime patch, and it settles any patch still pending first: that patch's own
// run was refuted or never finished, and a re-authored graph is not the one it
// was written for.
//
// **Reasons a patch stays unapplied.** `not_rerun`: no resumed run ran it (the
// resume was declined, or the patch came after the verdict). `run_cancelled`.
// `run_failed`: the run that ran it did not finish. `refuted`: it finished and
// its result was judged not to answer. `not_judged`: it finished and nothing
// judged it. `apply_failed`: judged to answer, and the apply itself refused.
// An unapplied adaptation keeps its trial evidence and stays reviewable; a
// person can still apply it through review.

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowAdaptation, AutomationStudioFlowArtifact, AutomationStudioFlowRunDetail, AutomationStudioRuntimeSession } from "../../../model/index.ts";
import { automationStudioGraphFlowWithAdaptationPatch } from "../adaptations/index.ts";
import { compactJsonObject } from "../compact-json.ts";
import { isJsonRecord } from "../json-values.ts";

/** What a deferred promotion decision waits for, as its `applyAt`. */
export const AUTOMATION_STUDIO_JUDGED_PROMOTION_APPLY_AT = "judged_whole_run";

export type AutomationStudioJudgedPromotionReason = "not_rerun" | "run_cancelled" | "run_failed" | "refuted" | "not_judged" | "apply_failed";

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
  const decision = adaptation.metadata?.approvalDecision;
  return isJsonRecord(decision)
    && decision.autoApply === true
    && decision.applyAt === AUTOMATION_STUDIO_JUDGED_PROMOTION_APPLY_AT
    && decision.applied === false
    && decision.settledAt === undefined
    && (decision.runId === undefined || decision.runId === runId);
}

/**
 * The candidate a resumed run runs: the stored graph Flow with every pending
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
 * resumed pass of this run ran the patch as part of its candidate.
 */
export function automationStudioJudgedPromotionOutcome(session: Pick<AutomationStudioRuntimeSession, "status" | "metadata">, ranIt: boolean): AutomationStudioJudgedPromotionOutcome {
  if (session.status === "cancelled") return { apply: false, reason: "run_cancelled" };
  if (session.status !== "succeeded" && session.status !== "failed") return { waiting: true };
  if (!ranIt) return { apply: false, reason: "not_rerun" };
  const verification = isJsonRecord(session.metadata?.resultVerification) ? session.metadata.resultVerification : undefined;
  if (verification?.performed === true && verification.verdict !== "answers") return { apply: false, reason: "refuted" };
  if (session.status !== "succeeded") return { apply: false, reason: "run_failed" };
  if (verification?.performed !== true) return { apply: false, reason: "not_judged" };
  return { apply: true };
}

/**
 * Settles every pending patch of this run against how `session` ended, and
 * answers `detail` with its receipts saying so. The caller saves the detail it
 * is handed back. Each adaptation is written as it is settled.
 */
export async function settleAutomationStudioJudgedPromotions(input: {
  ports: AutomationStudioJudgedPromotionPorts;
  projectId: string;
  flowId: string;
  session: Pick<AutomationStudioRuntimeSession, "runId" | "status" | "metadata">;
  detail: AutomationStudioFlowRunDetail;
}): Promise<AutomationStudioFlowRunDetail> {
  const recorded = automationStudioRunAdaptationIds(input.detail);
  if (!recorded.length || "waiting" in automationStudioJudgedPromotionOutcome(input.session, false)) return input.detail;
  const ran = new Set(candidateAdaptationIds(input.detail));
  const settled = new Map<string, JsonObject>();
  for (const adaptationId of recorded) {
    const adaptation = await input.ports.getFlowAdaptation(input.projectId, input.flowId, adaptationId);
    if (!adaptation) continue;
    const decision = isJsonRecord(adaptation.metadata?.approvalDecision) ? adaptation.metadata.approvalDecision : {};
    if (!automationStudioAwaitsJudgedRun(adaptation, input.session.runId)) {
      // Settled for this run already -- a receipt write that did not land -- is mirrored, never applied twice.
      if (decision.settledAt !== undefined && decision.judgedRunId === input.session.runId) settled.set(adaptationId, decision);
      continue;
    }
    const outcome = automationStudioJudgedPromotionOutcome(input.session, ran.has(adaptationId));
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
        return decision ? { ...attempt, approvalDecision: decision } : attempt;
      })
    }
  };
}

/** The same, for a run that has finished: its stored record is read, settled, and saved. */
export async function settleAutomationStudioRunJudgedPromotions(input: {
  ports: AutomationStudioJudgedPromotionPorts & {
    getFlowRunDetail(projectId: string, runId: string): Promise<AutomationStudioFlowRunDetail | null>;
    saveFlowRunDetail(detail: AutomationStudioFlowRunDetail): Promise<unknown>;
  };
  projectId: string;
  flowId: string | undefined;
  session: AutomationStudioRuntimeSession;
}): Promise<AutomationStudioRuntimeSession> {
  if (!input.flowId) return input.session;
  const detail = await input.ports.getFlowRunDetail(input.projectId, input.session.runId);
  if (!detail) return input.session;
  const settled = await settleAutomationStudioJudgedPromotions({ ports: input.ports, projectId: input.projectId, flowId: input.flowId, session: input.session, detail });
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

/** The adaptations a resumed pass of this run ran as its candidate (`./repair-rerun.ts`). */
function candidateAdaptationIds(detail: Pick<AutomationStudioFlowRunDetail, "metadata">): string[] {
  const retry = isJsonRecord(detail.metadata?.adaptiveRetry) ? detail.metadata.adaptiveRetry : undefined;
  return Array.isArray(retry?.candidateAdaptationIds) ? retry.candidateAdaptationIds.filter((id): id is string => typeof id === "string") : [];
}
