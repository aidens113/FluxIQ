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
// `run_failed`: the pass that ran it did not finish, an interrupted run's
// included. `refuted`: it finished and
// its result was not judged to answer. `not_judged`: it finished and nothing
// judged it. `run_parked`: the run stopped waiting on a person; no Core path
// continues a parked run on the candidate, so the settle is final.
// `run_errored`: the run threw. `apply_failed`: judged to answer, and the apply
// itself refused. `store_unavailable`: the project store went away before the
// settle could be read or written (t258); the session then says so. An unapplied adaptation keeps its trial evidence and stays
// reviewable; a person can still apply it through review.
//
// **A fix the run made in place (C6 step 8).** An in-run repair overlays its
// fix on the run's graph at the failing step and the executor re-attempts the
// unit there; the run's receipts for it are `metadata.inRunRepairs`. Its pass
// is this run itself: the fix ran when the executor kept its overlay, which the
// root trace says by listing the repair's id in `trace.repairs`. That
// re-attempt is its trial: once the run has ended, a held fix whose re-attempt
// passed moves from `testing` to `validated`, with the trial recorded
// (`./held-fix-validation.ts`), whether or not the run may promote. It is still
// saved only here, after the judged end, and the judged run is still the
// evidence the unattended apply rests on, exactly as for t267 below. A dropped
// fix stays `testing`, and so does a held one whose re-attempt gave no positive
// evidence: an expected state no host evaluated, or nothing declared but a route.
//
// **A patch whose trial proved nothing (t267).** A target override on a Flow
// that declares no evidence has a trial that neither proves nor contradicts it
// (`verification.awaitsJudgedRun`). Its evidence is this run: on `apply` the
// judged run is recorded as its succeeded trial, before the apply, so the
// apply's own evidence gate reads it. No other outcome records anything.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowAdaptation, AutomationStudioFlowArtifact, AutomationStudioFlowRunDetail, AutomationStudioRuntimeSession } from "../../../model/index.ts";
import { automationStudioDecisionAwaitsJudgedRun, automationStudioRunCandidateAdaptationIds } from "../../durable-behavior/index.ts";
import { automationStudioGraphFlowWithAdaptationPatch, automationStudioUnitRepairWritesRecoveryGraph, automationStudioVerificationAwaitsJudgedRun } from "../adaptations/index.ts";
import { compactJsonObject } from "../compact-json.ts";
import { isJsonRecord } from "../json-values.ts";
import { AutomationStudioProjectStoreUnavailableError } from "../../../storage/index.ts";
import type { AutomationStudioRuntimeAdaptationContext } from "./contracts.ts";
import { automationStudioRunInRunRepairAdaptationIds, validateAutomationStudioHeldInRunRepairs } from "./held-fix-validation.ts";

export type AutomationStudioJudgedPromotionReason = "not_rerun" | "run_cancelled" | "run_failed" | "refuted" | "not_judged" | "run_parked" | "run_errored" | "apply_failed" | "store_unavailable";

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
  const attempts = [...receiptsOf(detail, "runtimePatchAttempts"), ...receiptsOf(detail, "inRunRepairs")];
  const fromReceipts = attempts.flatMap((attempt) => (typeof attempt.adaptationId === "string" ? [attempt.adaptationId] : []));
  return [...new Set([...(detail.adaptationIds ?? []), ...fromReceipts])];
}

function receiptsOf(detail: Pick<AutomationStudioFlowRunDetail, "metadata">, key: "runtimePatchAttempts" | "inRunRepairs"): JsonObject[] {
  const receipts = detail.metadata?.[key];
  return Array.isArray(receipts) ? receipts.filter(isJsonRecord) : [];
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
      // An automation-scoped handler is written to the recovery Subflow's graph, not this one.
      if (patch.kind !== "edit_recovery" && !automationStudioUnitRepairWritesRecoveryGraph(patch)) flow = automationStudioGraphFlowWithAdaptationPatch(flow, adaptation, patch, input.flow.updatedAt);
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
  // A run its process left mid-flight did not finish, and nothing will finish it:
  // never promoted, and never left waiting for an end that cannot come.
  if (session.status === "interrupted") return { apply: false, reason: "run_failed" };
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
  /** `trace.repairs`, when the session carries its trace: the in-run repairs whose fix the run kept. */
  session: Pick<AutomationStudioRuntimeSession, "runId" | "status" | "metadata"> & { trace?: { repairs?: string[] | undefined } | undefined };
  detail: AutomationStudioFlowRunDetail;
  only?: "ran" | undefined;
  reason?: AutomationStudioJudgedPromotionReason | undefined;
}): Promise<AutomationStudioFlowRunDetail> {
  const recorded = automationStudioRunAdaptationIds(input.detail);
  if (!recorded.length) return input.detail;
  if (!input.reason && "waiting" in automationStudioJudgedPromotionOutcome(input.session, false)) return input.detail;
  const ran = new Set([...automationStudioRunCandidateAdaptationIds(input.detail), ...automationStudioRunInRunRepairAdaptationIds(input.detail, input.session.trace?.repairs)]);
  const settled = new Map<string, JsonObject>();
  for (const adaptationId of recorded) {
    if (input.only === "ran" && !ran.has(adaptationId)) continue;
    try {
      const decision = await settleRecorded(input, adaptationId, ran.has(adaptationId));
      if (decision) settled.set(adaptationId, decision);
    } catch (error) {
      // The store went away mid-settle: a patch still held stays unapplied, and its receipt says why.
      if (!AutomationStudioProjectStoreUnavailableError.is(error)) throw error;
      const held = receiptDecision(input.detail, adaptationId);
      if (held && automationStudioDecisionAwaitsJudgedRun(held, input.session.runId)) settled.set(adaptationId, unappliedForStore(held, input.session.runId, error));
    }
  }
  if (!settled.size) return input.detail;
  const attempts = Array.isArray(input.detail.metadata?.runtimePatchAttempts) ? input.detail.metadata.runtimePatchAttempts : [];
  const inRunRepairs = input.detail.metadata?.inRunRepairs;
  return {
    ...input.detail,
    metadata: {
      ...(input.detail.metadata ?? {}),
      runtimePatchAttempts: attempts.map((attempt) => withSettledDecision(attempt, settled)),
      ...(Array.isArray(inRunRepairs) ? { inRunRepairs: inRunRepairs.map((receipt) => withSettledDecision(receipt, settled)) } : {})
    }
  };
}

/** A receipt answered with how its adaptation was settled, when it was. */
function withSettledDecision(attempt: JsonValue, settled: ReadonlyMap<string, JsonObject>): JsonValue {
  if (!isJsonRecord(attempt) || typeof attempt.adaptationId !== "string") return attempt;
  const decision = settled.get(attempt.adaptationId);
  if (!decision) return attempt;
  // A trial's own pass rides on its receipt only until a pass adopts it (`./repair-rerun.ts`).
  const { completedTrace: _adoptedOrNot, ...kept } = attempt;
  return { ...kept, approvalDecision: decision };
}

/**
 * The same, for a run that has ended: its stored record is read, settled, and
 * saved. `reason` is for a run that threw, whose session cannot say why.
 *
 * Only a run whose adaptation context may promote can hold a patch for its
 * judged end: the promotion gate writes the hold, and only where
 * `behavior.promoteAdaptations` lets it (`./runtime-promotion.ts`). Any other
 * run -- no context, a deterministic run, manual approval, a dry run, a mode or
 * setting that forbids promotion -- has nothing to settle, and its record is
 * not read. Until t258 it was read at every judged end, so a deterministic run
 * whose project store could not be opened threw "pool is closing" from here in
 * place of ending failed with its own reason.
 *
 * A run that may promote, and whose store went away (the store is unavailable,
 * not answering with an error), does not throw either: what the store could not
 * take is noted on the session (`noteStoreUnavailable`), which is handed back.
 * Any other failure still throws, and a healthy store is settled as before.
 */
export async function settleAutomationStudioRunJudgedPromotions(input: {
  ports: AutomationStudioJudgedPromotionPorts & {
    getFlowRunDetail(projectId: string, runId: string): Promise<AutomationStudioFlowRunDetail | null>;
    saveFlowRunDetail(detail: AutomationStudioFlowRunDetail): Promise<unknown>;
    /** Where a settle the store could not take is noted: the session lives outside the project store. */
    writeRuntimeSession(projectId: string, session: AutomationStudioRuntimeSession): Promise<unknown>;
  };
  projectId: string;
  flowId: string | undefined;
  /** The run's adaptation context, `null` when it has none. Required, so no caller can forget the gate it carries. */
  context: Pick<AutomationStudioRuntimeAdaptationContext, "behavior"> | null | undefined;
  session: AutomationStudioRuntimeSession;
  reason?: AutomationStudioJudgedPromotionReason | undefined;
}): Promise<AutomationStudioRuntimeSession> {
  if (!input.flowId) return input.session;
  const promotes = input.context?.behavior.promoteAdaptations === true;
  // A held fix's trial is read off the run's trace, never off a run that threw.
  const validates = !input.reason && Boolean(input.session.trace?.repairs?.length);
  if (!promotes && !validates) return input.session;
  let detail: AutomationStudioFlowRunDetail | null;
  try {
    detail = await input.ports.getFlowRunDetail(input.projectId, input.session.runId);
  } catch (error) {
    if (!AutomationStudioProjectStoreUnavailableError.is(error)) throw error;
    return promotes ? await noteStoreUnavailable(input, "read_record", error, []) : input.session;
  }
  if (!detail) return input.session;
  if (validates) await validateAutomationStudioHeldInRunRepairs({ ports: input.ports, projectId: input.projectId, flowId: input.flowId, session: input.session, detail });
  if (!promotes) return input.session;
  const settled = await settleAutomationStudioJudgedPromotions({ ports: input.ports, projectId: input.projectId, flowId: input.flowId, session: input.session, detail, ...(input.reason ? { reason: input.reason } : {}) });
  const decided = settledForRun(settled, input.session.runId);
  if (settled !== detail) {
    try {
      await input.ports.saveFlowRunDetail(settled);
    } catch (error) {
      if (!AutomationStudioProjectStoreUnavailableError.is(error)) throw error;
      return await noteStoreUnavailable(input, "save_record", error, decided);
    }
  }
  const unwritten = decided.find((entry) => entry.notAppliedReason === "store_unavailable");
  return unwritten ? await noteStoreUnavailable(input, "settle", unwritten.error, decided) : input.session;
}

/**
 * The store went away while the run's held patches were being settled (t258).
 * Nothing is applied: the promotion gate's hold stays on any adaptation the
 * store could not take, so no unattended apply can follow from it, and a
 * person can still review it. So that it is not lost silently, the run's
 * session -- kept outside the project store -- records where the store went
 * away, why, and what was decided for each patch. The run ends with its own
 * outcome; this is written beside it, never in place of it.
 */
async function noteStoreUnavailable(
  input: { ports: { writeRuntimeSession(projectId: string, session: AutomationStudioRuntimeSession): Promise<unknown> }; projectId: string; session: AutomationStudioRuntimeSession },
  step: "read_record" | "settle" | "save_record",
  error: unknown,
  decided: JsonObject[]
): Promise<AutomationStudioRuntimeSession> {
  const noted: AutomationStudioRuntimeSession = {
    ...input.session,
    metadata: {
      ...(input.session.metadata ?? {}),
      judgedPromotionSettlement: compactJsonObject({
        status: "store_unavailable",
        step,
        at: Date.now(),
        reason: errorText(error),
        recordSaved: step === "settle",
        adaptations: decided.map((entry) => compactJsonObject({ adaptationId: entry.adaptationId, applied: entry.applied, notAppliedReason: entry.notAppliedReason }))
      })
    }
  };
  await input.ports.writeRuntimeSession(input.projectId, noted);
  return noted;
}

/** What this run's settle decided, receipt by receipt, with the adaptation each is for. */
function settledForRun(detail: AutomationStudioFlowRunDetail, runId: string): JsonObject[] {
  const attempts = [...receiptsOf(detail, "runtimePatchAttempts"), ...receiptsOf(detail, "inRunRepairs")];
  return attempts.flatMap((attempt) => {
    const decision = isJsonRecord(attempt.approvalDecision) ? attempt.approvalDecision : undefined;
    return decision && typeof attempt.adaptationId === "string" && decision.judgedRunId === runId && decision.settledAt !== undefined ? [{ ...decision, adaptationId: attempt.adaptationId }] : [];
  });
}

function receiptDecision(detail: AutomationStudioFlowRunDetail, adaptationId: string): JsonObject | undefined {
  const attempts = [...receiptsOf(detail, "runtimePatchAttempts"), ...receiptsOf(detail, "inRunRepairs")];
  const receipt = attempts.find((attempt) => attempt.adaptationId === adaptationId && isJsonRecord(attempt.approvalDecision));
  return receipt && isJsonRecord(receipt.approvalDecision) ? receipt.approvalDecision : undefined;
}

function unappliedForStore(held: JsonObject, runId: string, error: unknown): JsonObject {
  return compactJsonObject({ ...held, judgedRunId: runId, settledAt: Date.now(), applied: false, notAppliedReason: "store_unavailable", error: errorText(error) });
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** One recorded adaptation settled against the run, or nothing when it waits on no judgement of this run. */
async function settleRecorded(
  input: { ports: AutomationStudioJudgedPromotionPorts; projectId: string; flowId: string; session: Pick<AutomationStudioRuntimeSession, "runId" | "status" | "metadata">; reason?: AutomationStudioJudgedPromotionReason | undefined },
  adaptationId: string,
  ranIt: boolean
): Promise<JsonObject | undefined> {
  const adaptation = await input.ports.getFlowAdaptation(input.projectId, input.flowId, adaptationId);
  if (!adaptation) return undefined;
  const decision = isJsonRecord(adaptation.metadata?.approvalDecision) ? adaptation.metadata.approvalDecision : {};
  if (!automationStudioAwaitsJudgedRun(adaptation, input.session.runId)) {
    // Settled for this run already -- a receipt write that did not land -- is mirrored, never applied twice.
    return decision.settledAt !== undefined && decision.judgedRunId === input.session.runId ? decision : undefined;
  }
  const outcome: AutomationStudioJudgedPromotionOutcome = input.reason ? { apply: false, reason: input.reason } : automationStudioJudgedPromotionOutcome(input.session, ranIt);
  return "waiting" in outcome ? undefined : await settleOne(input, adaptation, decision, outcome);
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
  const saved = await input.ports.saveFlowAdaptation(withJudgedRunEvidence(withDecision(adaptation, recorded), input.session.runId));
  try {
    await input.ports.applyFlowAdaptation({
      projectId: input.projectId,
      flowId: input.flowId,
      adaptationId: adaptation.adaptationId,
      reason: JUDGED_TO_ANSWER
    });
    return recorded;
  } catch (error) {
    // An apply the store went away under is unapplied for that reason, not because the gates refused it.
    const notAppliedReason: AutomationStudioJudgedPromotionReason = AutomationStudioProjectStoreUnavailableError.is(error) ? "store_unavailable" : "apply_failed";
    const refused = compactJsonObject({ ...base, applied: false, notAppliedReason, autoApplyFailed: true, error: errorText(error) });
    await input.ports.saveFlowAdaptation(withDecision(saved, refused));
    return refused;
  }
}

const JUDGED_TO_ANSWER = "A whole run from the Flow's start ran this change and its result was judged to answer the request.";

/**
 * A change whose trial proved nothing either way has the judged whole run as
 * its evidence (t267; `../../live-patch.ts`, `awaitsJudgedRun`). That run has
 * now answered, so it is recorded as the change's succeeded trial before the
 * apply, whose gate wants one (`recovery/adaptation-promotion.ts`). Any other
 * change is returned as it is: its own trial is its evidence.
 */
function withJudgedRunEvidence(adaptation: AutomationStudioFlowAdaptation, runId: string): AutomationStudioFlowAdaptation {
  if (!automationStudioVerificationAwaitsJudgedRun(adaptation.metadata?.verification)) return adaptation;
  const judged = { runId, status: "succeeded" as const, checkedAt: Date.now(), kind: "trial" as const, basis: ["judged_whole_run"], detail: JUDGED_TO_ANSWER };
  return { ...adaptation, validationResults: [...(adaptation.validationResults ?? []), judged] };
}

function withDecision(adaptation: AutomationStudioFlowAdaptation, approvalDecision: JsonObject): AutomationStudioFlowAdaptation {
  return { ...adaptation, updatedAt: Date.now(), metadata: { ...(adaptation.metadata ?? {}), approvalDecision } };
}
