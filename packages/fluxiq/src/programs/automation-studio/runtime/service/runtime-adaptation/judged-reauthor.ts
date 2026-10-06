// A re-authored Flow is kept only after a whole run that ran it was judged to
// answer (user, 2026-10-02) -- the rule `./judged-promotion.ts` holds runtime
// patches to, now held for the re-author routes too (t267).
//
// **The order, as built.** A run refuted for its answer, or failed at a step
// the ladder could not repair, is re-authored: the build makes an extend-mode
// Flow Bootstrap adaptation and approves it, and it is *held* -- validated,
// unapplied (`./reauthor-build.ts`). The re-run from the Flow's start runs the
// held graph as an unapplied candidate and records which adaptation it ran
// (`./repair-rerun.ts`). That run is judged, and only then does this settle the
// held re-author against the run's final judged session.
//
// - **Applied** when that session ended `succeeded` with a performed verdict of
//   `answers` and its pass ran the held edit (`automationStudioJudgedPromotionOutcome`).
// - **Otherwise rejected**, with `notAppliedReason` on the run's re-author
//   marker -- the reasons a runtime patch takes, `run_errored` for a run that
//   threw, and `apply_failed` / `store_unavailable` for an apply that was
//   refused or whose store went away. A pass that ran the held edit and did not
//   finish is `run_failed` whatever verdict an earlier pass left on the
//   session. Rejected, not left validated: a validated Flow Bootstrap
//   adaptation is pending, and a pending one refuses every later build of the
//   Flow (`flow_bootstrap.pending_adaptation_exists`) -- the next run's
//   re-author and the person's own build alike. A rejection that is itself
//   refused is said on the marker as a code (`rejectRefused`).
// - **`superseded`**: an earlier held attempt a later re-author replaced is
//   never applied. The later attempt rejects it before it builds -- a pending
//   adaptation refuses every new build of the Flow -- and marks it so
//   (`./reauthor-build.ts`); one still waiting here is marked the same.
//
// **Why it was needed.** Before this, the build applied the edit and the re-run
// judged it after the fact: a re-run that was refuted or failed left the unjudged
// edit on the Flow, and an extend cannot be reverted
// (`revertFlowBootstrapAdaptation` refuses it).
//
// **Not gated on `promoteAdaptations`**, unlike a runtime patch: the route is
// authorised by its caller, and the held edit is that route's own.
//
// **A run that ended `succeeded`, ran no held edit and was not refuted has
// nothing here**, and its record is not read, so a run that answered on its
// first pass costs no store read (t258). A refuted run is read: its re-author
// may have built and held an edit whose re-run never happened. A record the
// store could not hand over leaves every held edit as it is -- unapplied --
// which is the safe side.

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowRunDetail, AutomationStudioRuntimeSession } from "../../../model/index.ts";
import {
  automationStudioRefutedResultHeldReauthor,
  automationStudioRefutedResultReauthorMarked,
  automationStudioRefutedResultWaitingReauthors
} from "../../recovery/refuted-result/index.ts";
import { AutomationStudioProjectStoreUnavailableError } from "../../../storage/index.ts";
import { compactJsonObject } from "../compact-json.ts";
import { automationStudioJudgedPromotionOutcome, type AutomationStudioJudgedPromotionReason } from "./judged-promotion.ts";

/** Where a re-run's session and its `repairedRerun` record name the held re-author that pass ran. */
export const AUTOMATION_STUDIO_HELD_REAUTHOR_RAN_KEY = "heldReauthorAdaptationId";

/** Why a held re-author was left unapplied. */
export type AutomationStudioJudgedReauthorReason = AutomationStudioJudgedPromotionReason | "superseded";

export type AutomationStudioJudgedReauthorPorts = {
  getFlowRunDetail(projectId: string, runId: string): Promise<AutomationStudioFlowRunDetail | null>;
  saveFlowRunDetail(detail: AutomationStudioFlowRunDetail): Promise<unknown>;
  /** The apply, through Flow Bootstrap review, so every apply gate runs on it. */
  applyFlowBootstrapAdaptation(input: { projectId: string; flowId: string; adaptationId: string; actorId: string }): Promise<unknown>;
  /** The rejection of a held edit that is not kept, through Flow Bootstrap review. */
  rejectFlowBootstrapAdaptation(input: { projectId: string; flowId: string; adaptationId: string; actorId: string }): Promise<unknown>;
  /** Where a settle the store could not save is noted: the session lives outside the project store. */
  writeRuntimeSession(projectId: string, session: AutomationStudioRuntimeSession): Promise<unknown>;
};

/**
 * Settles this run's held re-authors against how `session` -- its final judged
 * session -- ended, saves the run's record, and answers the session. `flowId`
 * is the Flow the re-author extended, the run's adaptation context's.
 * `reason` settles every held edit unapplied with it, whatever the session
 * says: a run that threw.
 */
export async function settleAutomationStudioRunJudgedReauthor(input: {
  ports: AutomationStudioJudgedReauthorPorts;
  projectId: string;
  flowId: string | undefined;
  session: AutomationStudioRuntimeSession;
  reason?: AutomationStudioJudgedReauthorReason | undefined;
}): Promise<AutomationStudioRuntimeSession> {
  const flowId = input.flowId;
  const ran = heldReauthorRan(input.session);
  if (!flowId || (!input.reason && !ran && input.session.status === "succeeded" && !refuted(input.session))) return input.session;
  let detail: AutomationStudioFlowRunDetail | null;
  try {
    detail = await input.ports.getFlowRunDetail(input.projectId, input.session.runId);
  } catch (error) {
    // Nothing read, so nothing applied: a held edit stays validated and unapplied.
    if (!AutomationStudioProjectStoreUnavailableError.is(error)) throw error;
    return input.session;
  }
  if (!detail || !automationStudioRefutedResultWaitingReauthors(detail).length) return input.session;
  const settled = await settleAutomationStudioJudgedReauthor({ ports: input.ports, projectId: input.projectId, flowId, session: input.session, detail, ran, ...(input.reason ? { reason: input.reason } : {}) });
  if (settled === detail) return input.session;
  try {
    await input.ports.saveFlowRunDetail(settled);
    return input.session;
  } catch (error) {
    if (!AutomationStudioProjectStoreUnavailableError.is(error)) throw error;
    const noted: AutomationStudioRuntimeSession = {
      ...input.session,
      metadata: { ...(input.session.metadata ?? {}), judgedReauthorSettlement: compactJsonObject({ status: "store_unavailable", step: "save_record", at: Date.now(), reason: error instanceof Error ? error.message : String(error) }) }
    };
    await input.ports.writeRuntimeSession(input.projectId, noted);
    return noted;
  }
}

/**
 * The run's record with each held, waiting re-author settled, or `detail`
 * itself when nothing was. The latest held edit is settled on the judged
 * outcome; any other is `superseded`. `ran` is the adaptation the judged
 * session's pass ran unapplied. Every held edit not applied is rejected.
 */
export async function settleAutomationStudioJudgedReauthor(input: {
  ports: Pick<AutomationStudioJudgedReauthorPorts, "applyFlowBootstrapAdaptation" | "rejectFlowBootstrapAdaptation">;
  projectId: string;
  flowId: string;
  session: Pick<AutomationStudioRuntimeSession, "runId" | "status" | "metadata" | "trace">;
  detail: AutomationStudioFlowRunDetail;
  ran: string | undefined;
  reason?: AutomationStudioJudgedReauthorReason | undefined;
}): Promise<AutomationStudioFlowRunDetail> {
  const latest = automationStudioRefutedResultHeldReauthor(input.detail);
  let detail = input.detail;
  for (const adaptationId of automationStudioRefutedResultWaitingReauthors(input.detail)) {
    const outcome = input.reason ? { apply: false as const, reason: input.reason }
      : adaptationId !== latest ? { apply: false as const, reason: "superseded" as const }
      : passDidNotFinish(input.session, input.ran === adaptationId) ? { apply: false as const, reason: "run_failed" as const }
      : automationStudioJudgedPromotionOutcome(input.session, input.ran === adaptationId);
    if ("waiting" in outcome) continue;
    const base = { judgedRunId: input.session.runId, settledAt: Date.now() };
    const settled = outcome.apply ? await applied(input, adaptationId, base) : { ...base, notAppliedReason: outcome.reason };
    detail = automationStudioRefutedResultReauthorMarked(detail, adaptationId, settled.applied === true ? settled : { ...settled, ...await rejected(input, adaptationId) });
  }
  return detail;
}

/** The apply, and what the marker records of it: `applied`, or why the apply did not land. */
async function applied(
  input: { ports: Pick<AutomationStudioJudgedReauthorPorts, "applyFlowBootstrapAdaptation">; projectId: string; flowId: string },
  adaptationId: string,
  base: JsonObject
): Promise<JsonObject> {
  try {
    await input.ports.applyFlowBootstrapAdaptation({ projectId: input.projectId, flowId: input.flowId, adaptationId, actorId: "runtime.result_repair" });
    return { ...base, applied: true };
  } catch (error) {
    // Codes only: the marker is published from the run, so the refusal's own words stay off it.
    const notAppliedReason: AutomationStudioJudgedReauthorReason = AutomationStudioProjectStoreUnavailableError.is(error) ? "store_unavailable" : "apply_failed";
    return { ...base, notAppliedReason };
  }
}

/**
 * Rejects a held edit that is not kept, so it does not stand pending in front
 * of every later build of the Flow. Nothing when it was rejected, and the
 * refusal's kind, never its words, when it was not.
 */
async function rejected(
  input: { ports: Pick<AutomationStudioJudgedReauthorPorts, "rejectFlowBootstrapAdaptation">; projectId: string; flowId: string },
  adaptationId: string
): Promise<JsonObject> {
  try {
    await input.ports.rejectFlowBootstrapAdaptation({ projectId: input.projectId, flowId: input.flowId, adaptationId, actorId: "runtime.result_repair" });
    return {};
  } catch (error) {
    return { rejectRefused: AutomationStudioProjectStoreUnavailableError.is(error) ? "store_unavailable" : "refused" };
  }
}

/** Whether the run's result was judged and found not to answer. */
function refuted(session: Pick<AutomationStudioRuntimeSession, "metadata">): boolean {
  const verification = session.metadata?.resultVerification;
  return Boolean(verification) && typeof verification === "object" && !Array.isArray(verification)
    && (verification as JsonObject).performed === true && (verification as JsonObject).verdict !== "answers";
}

/**
 * Whether the pass that ran the held edit ended without finishing. Such a pass
 * is never verified, and the re-run's session carries the earlier pass's
 * verdict forward (`./repair-rerun.ts` keeps the run's metadata), so read alone
 * that verdict would call a re-run that failed `refuted`. Its own trace says
 * what happened to it.
 */
function passDidNotFinish(session: Pick<AutomationStudioRuntimeSession, "status" | "trace">, ranIt: boolean): boolean {
  return ranIt && session.status === "failed" && session.trace !== undefined && session.trace.status !== "succeeded";
}

/** The held re-author the judged session's pass ran, as the re-run recorded it. */
function heldReauthorRan(session: Pick<AutomationStudioRuntimeSession, "metadata">): string | undefined {
  const ran = session.metadata?.[AUTOMATION_STUDIO_HELD_REAUTHOR_RAN_KEY];
  return typeof ran === "string" && ran ? ran : undefined;
}
