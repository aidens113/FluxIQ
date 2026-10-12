// One trial of a submitted candidate: run it once, from its declared start,
// through the normal runtime, and judge only what that run did (t339 design,
// unit U2).
//
// 1. The start. When the deployment has a start hook (D1), it is called first
//    and what it answered is recorded; otherwise the start is `not_reset` and
//    the trial runs on the target as it stands. A hook that fails ends the
//    trial before anything runs.
// 2. A runtime session of its own (`metadata.candidateTrial`), so the rows the
//    run stores land under the trial's run id and nowhere else.
// 3. The exact submitted candidate, run detached
//    (`runAutomationStudioDetachedCandidate`): never applied, no model, patch,
//    retry or recovery, under the executor options a normal run gets.
// 4. The session's end written, its datasets processed.
// 5. A run that did not reach its end is not judged. One that did is judged by
//    the build-test judge on the trial's evidence alone (`./summary.ts`), whose
//    yes needs a confirming second call (t296).
//
// A cancelled build is not a verdict: the abort is thrown, before any judge
// call, for the build to end cancelled.

import { createHash, randomUUID } from "node:crypto";
import type { AutomationStudioRuntimeSession } from "../../../model/index.ts";
import type { AutomationStudioCandidateTrialAct, AutomationStudioCandidateTrialRequest, AutomationStudioCandidateTrialResult } from "../../flow-bootstrap/candidate/index.ts";
import { runAutomationStudioDetachedCandidate, type AutomationStudioCandidateStartReceipt, type AutomationStudioCandidateVerificationIdentity } from "../../flow-bootstrap/verification/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../../executor/index.ts";
import { automationStudioResultReadAccounts, type AutomationStudioBuildTestVerdict, type AutomationStudioRunResultSummary } from "../../result-verification/index.ts";
import type { AutomationStudioCandidateTrialPorts, AutomationStudioCandidateTrialRecord, AutomationStudioCandidateTrialStart } from "./contracts.ts";
import { automationStudioCandidateTrialFeedback as Feedback } from "./feedback.ts";
import { automationStudioCandidateTrialLandedActs } from "./landed-acts.ts";
import { automationStudioTrialLearnedPaces } from "./learned-paces.ts";
import { automationStudioCandidateTrialSummary } from "./summary.ts";
import { automationStudioTrialWayOuts } from "./way-outs.ts";

const NO_SPEND: AutomationStudioCandidateTrialRecord["judge"] = Object.freeze({ calls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 });

/** Runs and judges one trial; the result is the trial gate's answer, the record Core's audit of it. */
export async function runAutomationStudioCandidateTrial(request: AutomationStudioCandidateTrialRequest, ports: AutomationStudioCandidateTrialPorts): Promise<{ result: AutomationStudioCandidateTrialResult; record: AutomationStudioCandidateTrialRecord }> {
  const { signal, candidate } = request;
  signal.throwIfAborted();
  const now = ports.now ?? Date.now;
  const answer = (verdict: AutomationStudioCandidateTrialResult["verdict"], feedback: AutomationStudioCandidateTrialResult["feedback"], record: Omit<AutomationStudioCandidateTrialRecord, "candidateId" | "revision" | "digest" | "verdict">, acts: AutomationStudioCandidateTrialAct[] = []) => ({
    result: { revision: request.revision, digest: request.digest, verdict, feedback, ...(record.trialRunId ? { trialRunId: record.trialRunId } : {}), ...(acts.length ? { acts } : {}) },
    record: { candidateId: request.candidateId, revision: request.revision, digest: request.digest, verdict, ...record }
  });
  const start = await prepared(request, ports);
  if (start.status === "failed") return answer("execution_failed", { code: start.code, start: start.status }, { start, execution: "not_run", code: start.code, judge: { ...NO_SPEND } });

  const runId = ports.newRunId?.() ?? `trial.${randomUUID()}`;
  const opened = await ports.openSession({ runId, metadata: { candidateTrial: { candidateId: request.candidateId, revision: request.revision, digest: request.digest, start: start.status } } });
  const startedAt = now();
  await ports.writeSession({ ...opened, status: "running", startedAt });
  // Bound to the candidate's own revision and digest; `requirementsDigest` has no
  // producer outside the parked requirement chain, so it is filled with the
  // original instructions' digest only to satisfy the runner's identity equality.
  const identity: AutomationStudioCandidateVerificationIdentity = { projectId: ports.projectId, flowId: ports.flowId, revision: request.revision, digest: request.digest, baseDependencyDigest: candidate.baseDependencyDigest, requirementsDigest: candidate.originalInstructionsDigest ?? "candidate.requirements.unbound" };
  const receipt: AutomationStudioCandidateStartReceipt = { receiptId: `${runId}.start`, conditionsDigest: createHash("sha256").update(JSON.stringify({ startLocation: ports.startLocation ?? null, start: start.status })).digest("hex"), preparedAt: startedAt, pageGeneration: 0, subjectStates: [] };
  let executed: Awaited<ReturnType<typeof runAutomationStudioDetachedCandidate>>;
  try {
    executed = await (ports.execute ?? runAutomationStudioDetachedCandidate)({
      identity, candidate: { revision: candidate.revision, digest: candidate.digest, baseDependencyDigest: candidate.baseDependencyDigest, buildPlan: candidate.buildPlan },
      parentFlow: await ports.parentFlow(), currentIdentity: async () => ({ ...identity, baseDependencyDigest: await ports.currentBaseDigest() }),
      ...(ports.registry ? { registry: ports.registry } : {}), resolution: ports.resolution, snapshots: await ports.snapshots(), deprecatedPublicationIds: await ports.deprecatedPublicationIds(),
      sourceInstructionIds: [...ports.sourceInstructionIds], runId, start: receipt,
      // The signal rides on the options alone: the runner refuses two different signals.
      options: ports.graphOptions({ runId, signal })
    });
  } catch (error) {
    // Not left running: a session that threw is ended failed, and the throw goes on to the trial gate.
    await ports.writeSession({ ...opened, status: signal.aborted ? "cancelled" : "failed", startedAt, finishedAt: now() });
    throw error;
  } finally {
    // Processed however the run ended, as a run's datasets are (`processEndedRunDatasets`).
    await ports.processDatasets(runId);
  }
  const ended: AutomationStudioRuntimeSession = { ...opened, status: executed.trace?.status ?? (executed.receipt.status === "succeeded" ? "succeeded" : executed.receipt.status === "cancelled" ? "cancelled" : "failed"),
    startedAt, finishedAt: executed.receipt.finishedAt, ...(executed.trace ? { trace: executed.trace } : {}),
    metadata: { ...(opened.metadata ?? {}), candidateTrial: { candidateId: request.candidateId, revision: request.revision, digest: request.digest, start: start.status, execution: executed.receipt.status, ...(executed.code ? { code: executed.code } : {}) } } };
  await ports.writeSession(ended);
  signal.throwIfAborted();
  // The handle of each way out the run pressed to close a layer the page put in the way, named by the domain (`./interruptions.ts`, t470).
  const shown = { trialRunId: runId, trace: executed.trace, graph: executed.graph, start: start.status, wayOuts: await wayOutHandles(executed.trace?.attempts ?? [], ports) };
  // What the run learned to slow down for is kept with the trial, for a promotion of it to keep (`./promotion.ts`).
  const learned = automationStudioTrialLearnedPaces(executed.trace, executed.graph), paced = learned.length ? { learnedPaces: learned } : {};
  // The lasting acts the run left on the site, whatever its verdict, for the build to undo before its next trial (t462).
  const acts = automationStudioCandidateTrialLandedActs(executed.trace, executed.graph);
  if (executed.receipt.status !== "succeeded") {
    const code = executed.code ?? `candidate.trial_${executed.receipt.status}`;
    // What each list read kept, from the run's own read accounts, as a judged trial's summary has them (t474).
    const { reads } = automationStudioResultReadAccounts({ actionAttempts: ports.actionAttempts?.(ended), flowNodes: executed.graph?.nodes, deniedEvidenceKeys: ports.deniedEvidenceKeys });
    const failed = Feedback.executionFailed({ code, ...shown, reads });
    return answer(failed.verdict, failed.feedback, { trialRunId: runId, start, execution: executed.receipt.status, code, ...paced, judge: { ...NO_SPEND } }, acts);
  }
  let summary: AutomationStudioRunResultSummary;
  try {
    summary = await automationStudioCandidateTrialSummary({ recordSets: await ports.recordSets(runId), graph: executed.graph, trace: executed.trace,
      ...(ports.readEndView ? { readEndView: () => ports.readEndView!({ runId }) } : {}), actionAttempts: ports.actionAttempts?.(ended),
      observedStateKeys: ports.observedStateKeys, deniedEvidenceKeys: ports.deniedEvidenceKeys });
  } catch (error) {
    // What the run stored could not be read, so nobody can say whether it answers: not judged, and never a yes.
    const code = "candidate.trial_result_unreadable";
    return answer("not_judged", { code, trialRunId: runId, start: start.status, failure: error instanceof Error && error.name ? error.name : "unknown error" }, { trialRunId: runId, start, execution: "succeeded", code, ...paced, judge: { ...NO_SPEND } }, acts);
  }
  const verdict: AutomationStudioBuildTestVerdict = await ports.judge({ summary });
  signal.throwIfAborted();
  const read = Feedback.judged({ verdict, summary, ...shown });
  const { calls, inputTokens, outputTokens, totalTokens, estimatedCostUsd } = verdict.spent;
  return answer(read.verdict, read.feedback, { trialRunId: runId, start, execution: "succeeded", ...(read.code ? { code: read.code } : {}), ...paced, judge: { calls, inputTokens, outputTokens, totalTokens, estimatedCostUsd } }, acts);
}

/**
 * The handles the domain names the trial's pressed ways out by. Asked only when
 * the run pressed one and the domain can name it; a way out it leaves out is
 * said without a handle, and the format then asks for no step closing it.
 */
async function wayOutHandles(attempts: readonly AutomationStudioNodeAttemptTrace[], ports: AutomationStudioCandidateTrialPorts): Promise<Readonly<Record<string, string>>> {
  const wayOuts = automationStudioTrialWayOuts(attempts);
  return wayOuts.length && ports.clearedControlHandles ? await ports.clearedControlHandles(wayOuts) : {};
}

/** The trial's start: the deployment's hook when it has one, otherwise the target as it stands. */
async function prepared(request: AutomationStudioCandidateTrialRequest, ports: AutomationStudioCandidateTrialPorts): Promise<AutomationStudioCandidateTrialStart> {
  const hook = ports.prepareStart;
  if (!hook) return { status: "not_reset" };
  try {
    const result = await hook({ projectId: ports.projectId, flowId: ports.flowId, candidateId: request.candidateId, revision: request.revision, digest: request.digest, ...(ports.startLocation ? { startLocation: ports.startLocation } : {}), signal: request.signal });
    return { status: "reset", result: structuredClone(result) };
  } catch (error) {
    if (request.signal.aborted) throw error;
    // The hook's own error text can carry deployment detail, so only its kind is kept.
    return { status: "failed", code: "candidate.trial_start_failed", failure: error instanceof Error && error.name ? error.name : "unknown error" };
  }
}
