// One trial of a submitted candidate: run it once, from its declared start,
// through the normal runtime, and judge only what that run did (t339 design,
// unit U2).
//
// 1. The start. When the deployment has a start hook (D1), it is called first
//    and what it answered is recorded; otherwise the start is `not_reset` and
//    the trial runs on the target as it stands. A hook that fails ends the
//    trial before anything runs. Since t475 the port runs the hook before the
//    build's reset check (`./port.ts`, `prepareStart`) and hands its start in
//    here, so the hook runs once, and before the check rather than after it.
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
//
// **A trial its judge did not judge is judged again, not run again (t473).**
// When the judge could not answer -- its calls failed, its deadline passed, or
// the purse refused it -- the trial's evidence is still whole: the run ended,
// and what it stored was read. So the trial hands that evidence back
// (`unjudged`), and the port asks the judge again on it when the same revision
// is tested again (`rejudgeAutomationStudioCandidateTrial`, `./port.ts`),
// instead of running the identical Flow again. Live run
// `run-mv5q4j5c-49bfb5e2` re-ran an 84-second trial only to get a judgement
// its timed-out judge would have given in 5 seconds.
//
// **A no keeps Core's record of it, outside the feedback (t633).** The judge's
// no carries Core's own record of it (`standingNo`,
// `../../result-verification/standing-no/`): the rows stored, the conditions
// read with, the rows a standing no called not the asked kind, and the
// conditions each standing no asks to remove. The trial's result carries it
// beside its feedback, never in it, for the trial gate to hold a later no to
// (`../../flow-bootstrap/candidate/trial-gate.ts`); no model is shown it.
//
// **A trial the purse cannot judge is not started (t661).** Before anything
// acts on the site, the purse is asked to hold the trial's two judge calls at
// their worst case (`./judging-fits.ts`). Where it cannot, the trial answers
// `not_judged` under `candidate.trial_unaffordable`, with the figures, and
// nothing runs; a re-judgement is not asked either, and keeps its evidence.
//
// **A yes's record says whether it was first-ask confirmed (t677).** The judge's
// yes says whether its first two calls reached it with nothing re-asked of a
// different verdict (`../../result-verification/first-ask/`); the record keeps
// that (`firstAskConfirmed`) for promotion to carry to the saved Flow, where the
// playback hold reads it in place of the record's call count.
//
// **A trial runs in its environment (traces and offline trials, U7).** Its
// clock, its run id (`trial.<unique>`, as before) and the client channel its
// work goes out on come from `ports.environment`, the live one when absent:
// the start, the run, the end view and attempt reads and the cleared-control
// handles all run inside `environment.within`, so an offline trial reaches only
// its own environment's sessions. Its executor options take the environment's
// clock, waits and randomness only when the ports name one, the live `random`
// left unset as a normal run leaves it (`../runtime-session/graph-options.ts`).
// An offline trial runs no start hook (Decision 6): it has no live effects to
// put back.
//
// **The trial's own run is its traced episode; its start is the build's
// (traces and offline trials, P2 D9, P3 D1).** With tracing installed the
// episode -- activity `test`, its id the trial's run id -- is opened here,
// after the affordability check and the start, around the run, its end and
// its judgement (`../../gateway-trace/wiring/trial.ts`). The start hook, the
// gate's `prepareStart` and this runner's own call alike, therefore runs in
// the build's context and its answer lands in the build's trace, correlated by
// candidate, revision and digest; a trial refused before it runs opens no
// episode. With nothing installed the run id is minted exactly as before.

import { createHash } from "node:crypto";
import type { AutomationStudioRuntimeSession } from "../../../model/index.ts";
import type { AutomationStudioCandidateTrialAct, AutomationStudioCandidateTrialRequest, AutomationStudioCandidateTrialResult } from "../../flow-bootstrap/candidate/index.ts";
import { runAutomationStudioDetachedCandidate, type AutomationStudioCandidateStartReceipt, type AutomationStudioCandidateVerificationIdentity } from "../../flow-bootstrap/verification/index.ts";
import { AUTOMATION_STUDIO_GATEWAY_TRACE_CONTEXT, withAutomationStudioGatewayTraceTrial } from "../../gateway-trace/wiring/index.ts";
import { automationStudioEnvironmentExecutorOptions, automationStudioLiveRunEnvironment, type AutomationStudioRunEnvironment } from "../../environment/index.ts";
import type { AutomationStudioGraphExecutionOptions, AutomationStudioNodeAttemptTrace } from "../../executor/index.ts";
import { AutomationStudioHostLeaseScope } from "../../project-agents/host-resources/index.ts";
import { automationStudioLlmStepLogReset } from "../../llm/step-log/index.ts";
import { automationStudioResultReadAccounts, type AutomationStudioBuildTestVerdict, type AutomationStudioResultStandingNoCarrier, type AutomationStudioRunResultSummary } from "../../result-verification/index.ts";
import type { AutomationStudioCandidateTrialPorts, AutomationStudioCandidateTrialRecord, AutomationStudioCandidateTrialStart, AutomationStudioCandidateTrialUnjudged } from "./contracts.ts";
import { automationStudioCandidateTrialFeedback as Feedback } from "./feedback.ts";
import { automationStudioCandidateTrialLandedActs } from "./landed-acts.ts";
import { automationStudioTrialLearnedPaces } from "./learned-paces.ts";
import { automationStudioCandidateTrialSummary } from "./summary.ts";
import { automationStudioTrialWayOuts } from "./way-outs.ts";
import { automationStudioCandidateFrameEvidence } from "./frame-evidence.ts";
import { automationStudioTrialJudgingShortfall } from "./judging-fits.ts";

const NO_SPEND: AutomationStudioCandidateTrialRecord["judge"] = Object.freeze({ calls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 });

/** The code of a trial not started because the purse cannot pay its two judge calls (header, t661). */
const UNAFFORDABLE = "candidate.trial_unaffordable";

/** One trial's answer and record; `unjudged` only when its judge did not judge it, with the evidence to ask the judge again on (header). */
export type AutomationStudioCandidateTrialOutcome = {
  /** The gate's answer, with Core's record of a no beside its feedback (header, t633). */
  result: AutomationStudioCandidateTrialResult & AutomationStudioResultStandingNoCarrier;
  record: AutomationStudioCandidateTrialRecord;
  unjudged?: AutomationStudioCandidateTrialUnjudged;
};

/**
 * Runs and judges one trial; the result is the trial gate's answer, the record
 * Core's audit of it. `judgeInputTokens` is the largest judge prompt an earlier
 * trial of this build sent, which sizes the judge calls held before it starts
 * (`./judging-fits.ts`).
 */
export async function runAutomationStudioCandidateTrial(request: AutomationStudioCandidateTrialRequest, ports: AutomationStudioCandidateTrialPorts, preparedStart?: AutomationStudioCandidateTrialStart, judgeInputTokens?: number): Promise<AutomationStudioCandidateTrialOutcome> {
  const environment = ports.environment ?? automationStudioLiveRunEnvironment;
  // The trial's client work runs on its environment's channel; live, exactly as before (header, U7).
  return await environment.within(() => trialIn(environment, request, ports, preparedStart, judgeInputTokens));
}

/** One trial, run inside its environment (header, U7). */
async function trialIn(environment: AutomationStudioRunEnvironment, request: AutomationStudioCandidateTrialRequest, ports: AutomationStudioCandidateTrialPorts, preparedStart?: AutomationStudioCandidateTrialStart, judgeInputTokens?: number): Promise<AutomationStudioCandidateTrialOutcome> {
  request.signal.throwIfAborted();
  const answer = answerFor(request);
  // Not started when the purse cannot pay both judge calls: nothing acts on the site and no judge is asked (header, t661).
  const unaffordable = automationStudioTrialJudgingShortfall({ code: UNAFFORDABLE, judgeInputTokens });
  if (unaffordable) return answer("not_judged", unaffordable, { start: preparedStart ?? { status: "not_reset" }, execution: "not_run", code: UNAFFORDABLE, judge: { ...NO_SPEND } });
  const start = preparedStart ?? await automationStudioCandidateTrialStart(request, ports);
  if (start.status === "failed") return answer("execution_failed", { code: start.code, start: start.status }, { start, execution: "not_run", code: start.code, judge: { ...NO_SPEND } });
  // The trial's episode opens only now, around its own run: the start above stays in the build's trace (header, P3).
  const context = (runId: string) => ({ schema: AUTOMATION_STUDIO_GATEWAY_TRACE_CONTEXT.candidateTrial, value: { kind: "candidate_trial", runId, candidateId: request.candidateId, revision: request.revision, digest: request.digest, start: start.status } });
  return await withAutomationStudioGatewayTraceTrial({ projectId: ports.projectId, flowId: ports.flowId, prefix: "trial", newRunId: ports.newRunId, environment, context },
    async (traced) => await runIn(environment, request, ports, start, traced?.() ?? ports.newRunId?.() ?? environment.newRunId("trial")));
}

/** The trial's own run from its start, under `runId`: its session, the detached run, its end and its judgement (header). */
async function runIn(environment: AutomationStudioRunEnvironment, request: AutomationStudioCandidateTrialRequest, ports: AutomationStudioCandidateTrialPorts, start: AutomationStudioCandidateTrialStart, runId: string): Promise<AutomationStudioCandidateTrialOutcome> {
  const { signal, candidate } = request;
  const now = ports.now ?? environment.now;
  const answer = answerFor(request);
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
      options: automationStudioTrialExecutorOptions(ports.graphOptions({ runId, signal }), ports.environment)
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
  const frames = automationStudioCandidateFrameEvidence(executed.trace?.attempts ?? [], executed.graph, executed.candidateGraphs);
  const shown = { trialRunId: runId, trace: executed.trace, graph: frames.graph, start: start.status, wayOuts: await wayOutHandles(frames.attempts, ports) };
  // What the run learned to slow down for is kept with the trial, for a promotion of it to keep (`./promotion.ts`).
  const learned = automationStudioTrialLearnedPaces(executed.trace, executed.graph, executed.candidateGraphs), paced = learned.length ? { learnedPaces: learned } : {};
  // The lasting acts the run left on the site, whatever its verdict, for the build to undo before its next trial (t462).
  const acts = automationStudioCandidateTrialLandedActs(executed.trace, frames.graph);
  if (executed.receipt.status !== "succeeded") {
    const code = executed.code ?? `candidate.trial_${executed.receipt.status}`;
    // What each list read kept, from the run's own read accounts, as a judged trial's summary has them (t474).
    const { reads } = automationStudioResultReadAccounts({ actionAttempts: ports.actionAttempts?.(ended)?.filter((attempt) => !attempt.subflowTarget), flowNodes: frames.graph?.nodes, deniedEvidenceKeys: ports.deniedEvidenceKeys });
    const failed = Feedback.executionFailed({ code, ...shown, reads });
    return answer(failed.verdict, failed.feedback, { trialRunId: runId, start, execution: executed.receipt.status, code, ...paced, judge: { ...NO_SPEND } }, acts);
  }
  let summary: AutomationStudioRunResultSummary;
  try {
    summary = await automationStudioCandidateTrialSummary({ recordSets: await ports.recordSets(runId), graph: frames.graph, trace: executed.trace,
      ...(ports.readEndView ? { readEndView: () => ports.readEndView!({ runId }) } : {}), actionAttempts: ports.actionAttempts?.(ended),
      observedStateKeys: ports.observedStateKeys, deniedEvidenceKeys: ports.deniedEvidenceKeys, ...(request.startedWith?.length ? { startedWith: request.startedWith } : {}) });
  } catch (error) {
    // What the run stored could not be read, so nobody can say whether it answers: not judged, and never a yes.
    const code = "candidate.trial_result_unreadable";
    return answer("not_judged", { code, trialRunId: runId, start: start.status, failure: error instanceof Error && error.name ? error.name : "unknown error" }, { trialRunId: runId, start, execution: "succeeded", code, ...paced, judge: { ...NO_SPEND } }, acts);
  }
  return await judged(request, ports, { summary, shown, start, ...paced }, acts);
}

/**
 * Asks the judge again about a trial it did not judge, on that trial's own
 * evidence: nothing is run, and no act is answered as left on the site, since
 * none was made (header). Its verdict is the trial's, under the trial's run id.
 */
export async function rejudgeAutomationStudioCandidateTrial(request: AutomationStudioCandidateTrialRequest, unjudged: AutomationStudioCandidateTrialUnjudged, ports: AutomationStudioCandidateTrialPorts, judgeInputTokens?: number): Promise<AutomationStudioCandidateTrialOutcome> {
  request.signal.throwIfAborted();
  // The judge is not asked again when the purse cannot pay both calls; the evidence is kept for when it can (header, t661).
  const unaffordable = automationStudioTrialJudgingShortfall({ code: UNAFFORDABLE, judgeInputTokens });
  if (unaffordable) {
    const refused = answerFor(request)("not_judged", { ...unaffordable, trialRunId: unjudged.shown.trialRunId }, { trialRunId: unjudged.shown.trialRunId, start: unjudged.start, execution: "succeeded", code: UNAFFORDABLE, judge: { ...NO_SPEND } });
    return { ...refused, unjudged };
  }
  return await judged(request, ports, unjudged, [], true);
}

/** The judge's verdict on a trial's evidence, as the gate's answer and Core's record; the evidence handed back when it was not judged. */
async function judged(request: AutomationStudioCandidateTrialRequest, ports: AutomationStudioCandidateTrialPorts, evidence: AutomationStudioCandidateTrialUnjudged, acts: AutomationStudioCandidateTrialAct[], again = false): Promise<AutomationStudioCandidateTrialOutcome> {
  const { summary, shown, start, learnedPaces } = evidence;
  const verdict: AutomationStudioBuildTestVerdict = await ports.judge({ summary });
  request.signal.throwIfAborted();
  const read = Feedback.judged({ verdict, summary, ...shown });
  const { calls, inputTokens, outputTokens, totalTokens, estimatedCostUsd } = verdict.spent;
  const feedback = again ? { ...read.feedback, judgedAgain: "The judge was asked again about the same trial run on the same evidence; the Flow was not run again." } : read.feedback;
  // Core's record of a no, beside the feedback and never in it (header, t633).
  // An unsure split keeps Core's record too, so a condition it vindicated is held across the build (t652, fix 2);
  // only a no is ever weighed as one by the gate's memory.
  const standingNo = (read.verdict === "no" && verdict.verdict === "no") || (read.verdict === "unsure" && verdict.verdict === "unknown") ? verdict.standingNo : undefined;
  // Whether the judge's yes was first-ask confirmed, on a yes the gate took as one: what promotion carries to the saved Flow (header, t677).
  const firstAsk = read.verdict === "yes" && verdict.verdict === "yes" && verdict.firstAskConfirmed !== undefined ? { firstAskConfirmed: verdict.firstAskConfirmed } : {};
  const outcome = answerFor(request)(read.verdict, feedback, { trialRunId: shown.trialRunId, start, execution: "succeeded", ...(read.code ? { code: read.code } : {}), ...(learnedPaces ? { learnedPaces } : {}), ...(again ? { judgedAgain: true as const } : {}), ...firstAsk, judge: { calls, inputTokens, outputTokens, totalTokens, estimatedCostUsd } }, acts, standingNo);
  return verdict.verdict === "not_judged" ? { ...outcome, unjudged: evidence } : outcome;
}

/** The gate's answer and Core's record of one trial of `request`'s revision. */
function answerFor(request: AutomationStudioCandidateTrialRequest) {
  return (verdict: AutomationStudioCandidateTrialResult["verdict"], feedback: AutomationStudioCandidateTrialResult["feedback"], record: Omit<AutomationStudioCandidateTrialRecord, "candidateId" | "revision" | "digest" | "verdict">, acts: AutomationStudioCandidateTrialAct[] = [], standingNo?: AutomationStudioResultStandingNoCarrier["standingNo"]): AutomationStudioCandidateTrialOutcome => ({
    result: { revision: request.revision, digest: request.digest, verdict, feedback, ...(record.trialRunId ? { trialRunId: record.trialRunId } : {}), ...(acts.length ? { acts } : {}), ...(standingNo ? { standingNo: structuredClone(standingNo) } : {}) },
    record: { candidateId: request.candidateId, revision: request.revision, digest: request.digest, verdict, ...record }
  });
}

/**
 * A trial's executor options under the environment its ports name (header,
 * U7): unchanged when they name none, so a live trial runs as it always has;
 * otherwise the environment's clock, waits and randomness, the live `random`
 * left unset as a normal run leaves it (`../../environment/executor-options.ts`).
 * Exported for the subflow trial, which runs under the same rule.
 */
export function automationStudioTrialExecutorOptions(options: AutomationStudioGraphExecutionOptions, environment: AutomationStudioRunEnvironment | undefined): AutomationStudioGraphExecutionOptions {
  return environment ? automationStudioEnvironmentExecutorOptions(options, environment) : options;
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

/**
 * The trial's start: the deployment's hook when it has one, otherwise the
 * target as it stands.
 *
 * Under a host-resource lease (A11) the hook is handed that lease, read from
 * the lease scope the trial runs in, and resets only the resource it names
 * (`./contracts.ts`, `AutomationStudioPrepareCandidateStart`). A lease that was
 * released or reissued is someone else's resource by now, so the hook is not
 * called and the start fails. Outside any lease scope the hook is called
 * exactly as before, with no lease.
 *
 * Every start, the gate's `prepareStart` and the run's own alike, comes
 * through here, so the hook is timed here as one `start_hook` reset step
 * (t737): no tool call marks it, and the Lab's build-time measure counted it
 * as the trial's replay. Only a hook actually called is a step.
 */
export async function automationStudioCandidateTrialStart(request: Pick<AutomationStudioCandidateTrialRequest, "candidateId" | "revision" | "digest" | "signal">, ports: AutomationStudioCandidateTrialPorts): Promise<AutomationStudioCandidateTrialStart> {
  const hook = ports.prepareStart;
  if (!hook) return { status: "not_reset" };
  // An offline trial has no live effects to put back, so it runs no start hook (header, Decision 6).
  if (ports.environment && ports.environment.kind !== "live") return { status: "not_reset" };
  const lease = AutomationStudioHostLeaseScope.current();
  if (lease && !AutomationStudioHostLeaseScope.gatewaySource.isCurrent(lease)) {
    return { status: "failed", code: "candidate.trial_start_lease_stale", failure: "the host resource lease this trial ran under is no longer held" };
  }
  return await automationStudioLlmStepLogReset({ stage: "start_hook" }, async (): Promise<AutomationStudioCandidateTrialStart> => {
    try {
      const result = await hook({ projectId: ports.projectId, flowId: ports.flowId, candidateId: request.candidateId, revision: request.revision, digest: request.digest, ...(ports.startLocation ? { startLocation: ports.startLocation } : {}), ...(lease ? { lease: structuredClone(lease) } : {}), signal: request.signal });
      return { status: "reset", result: structuredClone(result) };
    } catch (error) {
      if (request.signal.aborted) throw error;
      // The hook's own error text can carry deployment detail, so only its kind is kept.
      return { status: "failed", code: "candidate.trial_start_failed", failure: error instanceof Error && error.name ? error.name : "unknown error" };
    }
  }, (start) => start.status);
}
