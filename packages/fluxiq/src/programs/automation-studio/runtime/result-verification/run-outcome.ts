// What a finished run's verification does to the run's own record.
//
// A verdict nobody acts on is a comment. Four live runs on 2026-09-17 each
// reported `passed` while returning the wrong thing, and the only reason that
// was visible at all is that the test facility holds a written answer key. So
// this is the half that makes the verdict count: a run whose result does not
// answer the request, or whose result nobody could confirm, is written back as
// `failed`, with the code, the reason and the observation on the run, exactly
// as any other failure is.
//
// It runs only on a run that reported success. A run that already failed is
// already telling the truth, and spending a model call to add a second reason
// to it would buy nothing. The one thing a failed run is handed to here is the
// failed-step re-author (`repairFailedStep` below): a step the patch ladder
// could not repair is re-found by the build loop, and the re-run is judged.
//
// A run whose result could not be put to a model at all keeps the status its
// steps earned and is recorded `unverified`, never `confirmed`
// (`verification-status.ts` says why it is not failed instead). So does a run
// the model did not judge to answer and then, asked again with the same
// evidence, did not twice judge not to (`agreement.ts`): only two agreeing
// refutations fail a run whose every step succeeded.
//
// **Every finished run is put to the question, including one that stored
// nothing.** An empty record set, and a run with no record set at all, were
// both exempt until 2026-09-24 and are not any more (`verify.ts` says what the
// exemption cost). The one thing that changes for them here is the order of the
// reads: the instructions, the provider and the run detail are fetched for them
// too, because a model asked whether an empty answer is the right one cannot
// answer without the request and without the steps that ran.
//
// **The whole of that is bounded.** Reading the result, resolving the provider
// and making the calls all run inside one deadline (`deadline.ts`), because the
// reason the empty result was exempt in the first place is a hang on that path
// that was never root-caused. Nothing inside the bound writes anything -- every
// write this module makes happens after the judgement comes back -- so an
// abandoned verification cannot write over the record its own run is about to
// get. One that does not finish is recorded as one that did not finish:
// `core.result.verification_did_not_finish`, `unverified`, the run keeping the
// status its steps earned. That is what the old exemption produced anyway,
// except that now it is the failure case rather than the rule.
//
// Everything it reaches outside itself is a port, for the reason
// `recovery/annotation/ports.ts` states: the service is a six-thousand-line
// class at its own line budget, and a path that can only be driven by standing
// up a project directory and a live run is a path nobody writes an assertion
// about.

import type { AutomationStudioRunDatasetPage, AutomationStudioRunDatasetSummary } from "@fluxiq/contracts/automation-studio";
import type { JsonObject } from "../../../../core/index.ts";
import type {
  AutomationStudioAdaptationPolicy,
  AutomationStudioFlowDocument,
  AutomationStudioFlowInstruction,
  AutomationStudioFlowRunDetail,
  AutomationStudioRuntimeSession
} from "../../model/index.ts";
import {
  automationStudioFlowInstructionDigest,
  automationStudioFlowVersionsFromMetadata,
  automationStudioMetadataWithFlowVersions,
  type AutomationStudioFlowGraphJudgement,
  type AutomationStudioFlowGraphVersion,
  type AutomationStudioJudgedFlowGraphVersion
} from "../flow-version/index.ts";
import type { AutomationStudioGraphExecutionTrace } from "../executor/index.ts";
import type { AutomationStudioLlmProvider, AutomationStudioLlmTokenLimits } from "../llm/index.ts";

import {
  automationStudioRefutedResultFlowWasReauthored,
  automationStudioResultRepairSettled,
  repairAutomationStudioRefutedRunResult,
  type AutomationStudioFailedStepRepairPort,
  type AutomationStudioRefutedResultRepairPort,
  type AutomationStudioResultRepairHistoryEntry,
  type AutomationStudioResultRepairOutcome
} from "../recovery/refuted-result/index.ts";
import { automationStudioResultVerificationFailsRun, type AutomationStudioResultVerificationOutcome, type AutomationStudioRunResultSummary } from "./contracts.ts";
import { automationStudioResultCoreObservation, automationStudioResultFailureRecord } from "./core-observation.ts";
import { automationStudioResultVerificationWithinDeadline } from "./deadline.ts";
import { automationStudioRecordedResultRepair } from "./repair-directive.ts";
import { AUTOMATION_STUDIO_RESULT_SUMMARY_LIMITS, summarizeAutomationStudioRunResult, type AutomationStudioResultRecordSetInput } from "./result-summary.ts";
import { automationStudioResultVerificationStatus } from "./verification-status.ts";
import { AUTOMATION_STUDIO_RESULT_VERIFICATION_SKIP_CODES, verifyAutomationStudioRunResult } from "./verify.ts";
import { automationStudioZeroProviderGate } from "./zero-provider-run.ts";

/**
 * A resolver's answer, normalized to the one shape the verification reads.
 *
 * Core's provider resolver answers either a provider or a resolution around
 * one, and every caller has to tell them apart. Doing it here keeps that one
 * line out of the run service, which is at its own line budget, and keeps the
 * two shapes from being told apart twice and differently.
 */
export function automationStudioResultVerificationProvider(
  resolved: AutomationStudioLlmProvider | AutomationStudioResultVerificationProvider | undefined
): AutomationStudioResultVerificationProvider | undefined {
  if (!resolved) return undefined;
  return "provider" in resolved ? resolved : { provider: resolved };
}

/** The model that judges a result, with whatever the resolution bounds it to. */
export type AutomationStudioResultVerificationProvider = {
  provider: AutomationStudioLlmProvider;
  tokenLimits?: Partial<AutomationStudioLlmTokenLimits>;
  timeoutMs?: number;
  maxEstimatedCostUsd?: number;
};

/** Everything the verification reaches outside itself. */
export type AutomationStudioResultVerificationPorts = {
  /**
   * The run's stored record sets. Absent where the deployment stores no records
   * at all, which is a configuration and not a failure: a run that could never
   * have stored a record set has no result of this kind to judge, and the run
   * records that rather than a verdict.
   */
  listRunDatasets?: ((input: { projectId: string; runId: string }) => Promise<AutomationStudioRunDatasetSummary[]>) | undefined;
  getRunDatasetPage?: ((input: { projectId: string; runId: string; datasetId: string; limit?: unknown }) => Promise<AutomationStudioRunDatasetPage | null>) | undefined;
  flowInstructionSet(input: { projectId: string; flowId: string; subflowId?: string }): Promise<AutomationStudioFlowInstruction[]>;
  getFlowRunDetail(projectId: string, runId: string): Promise<AutomationStudioFlowRunDetail | null>;
  saveFlowRunDetail(detail: AutomationStudioFlowRunDetail): Promise<unknown>;
  writeRuntimeSession(projectId: string, session: AutomationStudioRuntimeSession): Promise<unknown>;
  /**
   * Resolves the model that judges this run's result, or answers nothing.
   *
   * Nothing means the question cannot be put at all -- no model is configured
   * for this Flow, or this run was not authorized to ask one. That is recorded
   * as a verification that did not happen, which is a different fact from a
   * verdict and must never be read as a pass.
   */
  resolveProvider?: ((input: { projectId: string; flowId: string }) => Promise<AutomationStudioResultVerificationProvider | undefined>) | undefined;
  /** The bound domain's declared denied keys. Absent means nobody declared any, and no row is sampled. */
  deniedEvidenceKeys?: readonly string[] | undefined;
  /**
   * Says what this check found on the run's own conversation thread.
   *
   * Handed the facts and Core's own words, never a composed sentence: what to
   * say, and whether a passing check says anything at all, is the schedule's to
   * decide (`result-check-schedule/conversation.ts`). Absent where the
   * deployment has no conversations, which is a configuration and not a
   * failure.
   */
  sayResultCheck?: ((input: { runId: string; status: string; checked: boolean; reason: string; observation: string; datasetId?: string }) => Promise<unknown>) | undefined;
  /**
   * Hands a run whose result was judged wrong back to the loop's failure entry
   * point, so the ladder repairs it as it repairs a failed step.
   *
   * Absent means nothing repairs a wrong answer here, and the verification's
   * verdict is a receipt again. That is the behaviour this port was added to
   * end, so it is left optional only because a deployment with no recovery
   * configured has nowhere to hand it.
   */
  repairRefutedResult?: AutomationStudioRefutedResultRepairPort | undefined;
  /**
   * Re-authors a Flow whose run failed at a step the patch ladder could not
   * repair, and answers the run with the attempt on it -- or nothing, when the
   * run is not one it routes (`recovery/refuted-result/step-failure-decision.ts`).
   * An applied edit is then re-run through `rerunRepairedFlow` and the re-run
   * judged, exactly as a repaired wrong answer is. Absent, a failed run is
   * handed back as the ladder left it.
   */
  repairFailedStep?: AutomationStudioFailedStepRepairPort | undefined;
  /**
   * Runs the Flow again once a repair has actually changed it, and answers the
   * run that produced.
   *
   * Without this the loop does not close. A repair that edits the Flow and
   * stops has produced a corrected Flow sitting on disk, and the thing that was
   * asked for is the corrected Flow *answering the question*: until it has run,
   * nobody -- not the person, not the next agent, not an evaluation -- knows
   * whether the edit helped. So the re-run happens here, where the verdict that
   * triggered it was reached, and its own result is judged in its turn.
   *
   * Absent leaves the older behaviour: the edit lands and the run reports the
   * answer it originally gave.
   */
  rerunRepairedFlow?: ((input: { detail: AutomationStudioFlowRunDetail; subflowId?: string | undefined }) => Promise<{ session: AutomationStudioRuntimeSession; flow?: AutomationStudioFlowDocument | undefined } | undefined>) | undefined;
  /**
   * Binds this verdict to the graph versions the run executed.
   *
   * Until this existed the two were unjoined: a verdict keyed to a run, a
   * version chain keyed to a graph, and nothing anywhere saying which revision
   * the judged run had actually run. A regression could therefore be judged and
   * never attributed, because "worse than what" had no referent.
   *
   * Absent where the deployment has no project database, which is a
   * configuration and not a failure: the run still records its version set on
   * its own detail, so a reader can still say which version a result belongs
   * to; what is missing is only the queryable history across runs.
   */
  recordFlowGraphJudgements?: ((input: { projectId: string; judgement: AutomationStudioFlowGraphJudgement }) => Promise<unknown>) | undefined;
  /**
   * Judges a finished run that asked no model anything as a replay of each
   * applied change it executed, and saves what it proved
   * (`service/runtime-adaptation/adaptation-replays.ts`). Absent, no replay is
   * ever recorded and no change rises past `provisional`.
   */
  recordAdaptationReplays?: ((input: { projectId: string; flowId: string; runId: string; checkedAt: number; trace: AutomationStudioGraphExecutionTrace; subflowId?: string }) => Promise<unknown>) | undefined;
};

export type AutomationStudioRuntimeSessionVerificationInput = {
  ports: AutomationStudioResultVerificationPorts;
  projectId: string;
  session: AutomationStudioRuntimeSession;
  /** The Flow that ran, for its authored shape. */
  flow?: AutomationStudioFlowDocument | undefined;
  subflowId?: string | undefined;
  policy?: AutomationStudioAdaptationPolicy | undefined;
  maxEstimatedCostUsd?: number | undefined;
  /**
   * What the checking schedule decided about this run, recorded whether or not
   * the run was checked.
   *
   * A run the schedule passed over is not silent about it. It still runs this
   * verification, still reaches `core.result.no_model_available` and is still
   * recorded `unverified` -- and it now carries the decision's own code and
   * sentence beside that, so a reader can tell "this run is not one the
   * schedule checks" from "nobody configured checking" from "the authorization
   * ran out". Absent for a caller with no schedule in force, which leaves that
   * caller's behaviour exactly as it was.
   */
  resultCheck?: { checked: boolean; epoch: number; code: string; reason: string } | undefined;
  /**
   * How long the whole verification may take, provider resolution included.
   * Omitted takes `deadline.ts`'s default; zero or less removes the bound, which
   * only a caller that supplies its own `signal` should do.
   */
  verificationDeadlineMs?: number | undefined;
  signal?: AbortSignal | undefined;
  /**
   * The refutations earlier passes of this verification met on this run,
   * oldest first, each as the next repair is shown it
   * (`recovery/refuted-result/history.ts`). Set by the re-run below, never by
   * a caller: it holds the check's own prose, which lives only as long as the
   * repair loop that reads it.
   */
  repairHistory?: readonly AutomationStudioResultRepairHistoryEntry[] | undefined;
};

/**
 * The session a run reports, after its result has been judged.
 *
 * The session that comes back is the one the caller returns to whoever started
 * the run, so a failed verification reaches the caller as a failed run and not
 * as a note filed somewhere.
 */
export async function verifyAutomationStudioRuntimeSessionResult(
  input: AutomationStudioRuntimeSessionVerificationInput
): Promise<AutomationStudioRuntimeSession> {
  if (input.session.status !== "succeeded") return await repairFailedStep(input);
  // Which graphs this run executed, and at which revision, as the run itself
  // recorded when its session was written. Read from the session rather than
  // re-read from storage: a second read could answer with a revision this run
  // did not execute, and a version set naming a version that never ran is worse
  // than none at all.
  const flowVersions = automationStudioFlowVersionsFromMetadata(input.session.metadata);
  // The whole verification, under one deadline: nothing it does can leave the
  // run unfinished, and nothing it does writes, so an abandoned one cannot
  // write over the record this call is about to write.
  const bounded = await automationStudioResultVerificationWithinDeadline({
    ...(input.verificationDeadlineMs !== undefined ? { deadlineMs: input.verificationDeadlineMs } : {}),
    ...(input.signal ? { signal: input.signal } : {}),
    judge: async () => await runVerification(input)
  });
  const report: AutomationStudioRuntimeSessionVerificationReport = bounded.settled
    ? bounded.value
    : { outcome: verificationDidNotFinish(bounded.reason, bounded.error), interventions: [] };
  const outcome = report.outcome;
  const failing = outcome.performed === true && automationStudioResultVerificationFailsRun(outcome);
  const scheduled = recordedResultCheck(input, outcome);
  const recordedMetadata = { resultVerification: recordedOutcome(outcome), ...(scheduled ? { resultCheck: scheduled } : {}) };
  const next: AutomationStudioRuntimeSession = failing
    ? { ...input.session, status: "failed", metadata: { ...(input.session.metadata ?? {}), ...recordedMetadata } }
    : { ...input.session, metadata: { ...(input.session.metadata ?? {}), ...recordedMetadata } };
  await input.ports.writeRuntimeSession(input.projectId, next);
  const record = await recordOnRunDetail(input, next, outcome, report.interventions, flowVersions);
  const recorded = record?.detail;
  // The join this module exists to make: the verdict, against the versions the
  // run executed. It is written after the run's own record, so a reader who
  // finds a judgement row always finds the run behind it, and before the repair
  // below, so the refutation that sent a Flow to be repaired is on record at the
  // revision it was about -- which is the revision a later rollback would return
  // to, and the one thing the repair is about to change.
  await recordFlowGraphJudgements(input, outcome, flowVersions, report.instructionDigest ?? null, next.finishedAt ?? Date.now());
  // A run that asked no model anything is the replay the confidence rule counts
  // (`./zero-provider-run.ts`), and it is recorded as one.
  if (record?.askedNoModel) await recordAdaptationReplays(input, next);
  // Only a run that was actually put to the question has anything to say. What
  // to say, and whether to say it at all, belongs to the schedule: this hands
  // over the facts and Core's own words, never the model's prose. It is said
  // before the repair below is entered, so the thread reads in the order the
  // run lived it: what the check found, then what was done about it.
  if (input.resultCheck && outcome.performed === true) {
    await input.ports.sayResultCheck?.({
      runId: input.session.runId,
      status: automationStudioResultVerificationStatus(outcome),
      checked: input.resultCheck.checked,
      reason: outcome.reason,
      observation: outcome.observation,
      ...(report.datasetId !== undefined ? { datasetId: report.datasetId } : {})
    });
  }
  // The half that makes a wrong answer repairable. A run that failed here
  // failed at `verification`, and until now that was the end of it: the ladder
  // is keyed on a failed *attempt*, a clean run has none, and the planner
  // answered `stop`. The run is handed to the same failure entry point every
  // other failure goes through, carrying the attempt the refutation amounts to.
  // It continues from the detail `recordOnRunDetail` just wrote, verdict and
  // schedule decision included, rather than re-reading the row it wrote.
  if (recorded && report.summary && input.ports.repairRefutedResult) {
    const repaired = await repairAutomationStudioRefutedRunResult({
      runId: next.runId,
      detail: recorded,
      outcome,
      summary: report.summary,
      ...(input.flow ? { flow: input.flow } : {}),
      ...(input.subflowId ? { subflowId: input.subflowId } : {}),
      now: next.finishedAt ?? Date.now(),
      repair: input.ports.repairRefutedResult,
      saveFlowRunDetail: (detail) => input.ports.saveFlowRunDetail(detail),
      history: input.repairHistory ?? [],
      willRerun: input.ports.rerunRepairedFlow !== undefined
    });
    // The loop closes: the corrected Flow runs, and the run it produces is
    // judged exactly as this one was. Only where the repair actually reached
    // the Flow -- an edit that was built and could not be applied has changed
    // nothing, and re-running would buy a second verdict on the same Flow.
    //
    // **Bounded by a count and by convergence, and each pass is told the ones
    // before it.** The re-run keeps this run's id and carries its metadata
    // forward, so the marker counting this run's repairs survives
    // (`recovery/refuted-result/repair.ts`), and the pass below is handed this
    // refutation as history. A refutation past the bound, or a second repair in
    // a row that changed nothing in the answer, is recorded and stops there
    // (`recovery/refuted-result/history.ts`).
    if (repaired && !repaired.stopped) {
      const reauthored = automationStudioRefutedResultFlowWasReauthored(repaired.detail);
      const rerun = reauthored && input.ports.rerunRepairedFlow
        ? await input.ports.rerunRepairedFlow({ detail: repaired.detail, ...(input.subflowId ? { subflowId: input.subflowId } : {}) })
        : undefined;
      if (rerun?.session.status === "succeeded") {
        return await verifyAutomationStudioRuntimeSessionResult({
          ...input,
          session: rerun.session,
          ...(rerun.flow ? { flow: rerun.flow } : {}),
          repairHistory: [...(input.repairHistory ?? []), repaired.entry]
        });
      }
      // A re-run that did not finish with a result has nothing to judge, and a
      // repair that could not be re-run has nothing to show: either way the
      // repair is over, and the run says so rather than reading as in progress.
      if (reauthored && input.ports.rerunRepairedFlow) await settleResultRepair(input, next.runId, rerun ? "rerun_failed" : "not_rerun");
      return rerun?.session ?? next;
    }
    if (repaired) return next;
  }
  // No repair was entered on this pass. If an earlier pass started one -- this
  // is the re-run it earned -- it ends here, with this pass's verdict.
  if (recorded) {
    const settled = automationStudioResultRepairSettled(recorded, repairOutcomeOf(outcome, failing), Date.now());
    if (settled) await input.ports.saveFlowRunDetail(settled);
  }
  return next;
}

/**
 * A run that failed at a step, after the patch ladder has had it.
 *
 * Until t193 this was the first line of the verification and the end of the
 * run: a failed run is already telling the truth about its steps, so it was
 * handed back. That is still what happens to every failed run the failed-step
 * route does not take. What the route takes -- a step whose target is gone
 * from a changed site, which the ladder could not re-point -- is re-authored,
 * and an edit that reached the Flow is run again and the re-run verified like
 * any other run, which is what closes the loop for a failed step as
 * `rerunRepairedFlow` closes it for a wrong answer. The attempt is saved on the
 * run before the re-run, so a re-run that throws still leaves it on record.
 * The route re-authors a run once (`step-failure-decision.ts`), so a re-run
 * that fails at a step again comes back here and is handed back failed.
 */
async function repairFailedStep(input: AutomationStudioRuntimeSessionVerificationInput): Promise<AutomationStudioRuntimeSession> {
  const port = input.ports.repairFailedStep;
  if (input.session.status !== "failed" || !port) return input.session;
  const detail = await input.ports.getFlowRunDetail(input.projectId, input.session.runId);
  if (!detail) return input.session;
  const failedTraceAttempt = [...(input.session.trace?.attempts ?? [])].reverse().find((attempt) => attempt.status === "failed");
  const repaired = await port({
    detail,
    ...(failedTraceAttempt ? { failedTraceAttempt } : {}),
    ...(input.flow ? { flow: input.flow } : {}),
    ...(input.subflowId ? { subflowId: input.subflowId } : {}),
    ...(input.ports.deniedEvidenceKeys ? { deniedEvidenceKeys: input.ports.deniedEvidenceKeys } : {})
  });
  if (!repaired) return input.session;
  await input.ports.saveFlowRunDetail(repaired.detail);
  if (!repaired.reauthored || !input.ports.rerunRepairedFlow) return input.session;
  const rerun = await input.ports.rerunRepairedFlow({ detail: repaired.detail, ...(input.subflowId ? { subflowId: input.subflowId } : {}) });
  if (!rerun) return input.session;
  return await verifyAutomationStudioRuntimeSessionResult({ ...input, session: rerun.session, ...(rerun.flow ? { flow: rerun.flow } : {}) });
}

/** How a repair ends when the answer its re-run gave is not repaired again. */
function repairOutcomeOf(outcome: AutomationStudioResultVerificationOutcome, failing: boolean): AutomationStudioResultRepairOutcome {
  if (outcome.performed === true && outcome.verdict === "answers") return "answered";
  return failing ? "stopped" : "unverified";
}

/** Marks a repair in progress on this run as finished, from the run's own stored record. */
async function settleResultRepair(input: AutomationStudioRuntimeSessionVerificationInput, runId: string, outcome: AutomationStudioResultRepairOutcome): Promise<void> {
  const detail = await input.ports.getFlowRunDetail(input.projectId, runId);
  const settled = detail ? automationStudioResultRepairSettled(detail, outcome, Date.now()) : undefined;
  if (settled) await input.ports.saveFlowRunDetail(settled);
}

/**
 * The schedule's decision as the run record holds it, with the verdict this run
 * actually reached written beside it.
 *
 * `checked` is what tells a status that a check produced from a status that
 * nothing produced, and the run store keys its `result_verification_status`
 * column on exactly this: a run the schedule passed over writes null there,
 * which is a different fact from `unverified` and must stay so. `epoch` is the
 * Flow revision the run belongs to, which is what makes the count restart when
 * a repair lands.
 */
function recordedResultCheck(
  input: AutomationStudioRuntimeSessionVerificationInput,
  outcome: AutomationStudioResultVerificationOutcome
): JsonObject | undefined {
  const scheduled = input.resultCheck;
  if (!scheduled) return undefined;
  return { checked: scheduled.checked, epoch: scheduled.epoch, code: scheduled.code, reason: scheduled.reason, status: automationStudioResultVerificationStatus(outcome) };
}

type AutomationStudioRuntimeSessionVerificationReport = Awaited<ReturnType<typeof verifyAutomationStudioRunResult>> & {
  /** What the run produced, when it could be read. The repair is shown it; the verification was already. */
  summary?: AutomationStudioRunResultSummary;
  /**
   * The first record set the verification judged.
   *
   * The dataset id travels with the report so a conversation turn about a
   * refutation can attach the rows that were judged. It is an id, never a row:
   * what the person then opens is the stored record set, through the surface
   * that already has permission to show it.
   */
  datasetId?: string;
  /**
   * The digest of the request this verdict was reached against, where the
   * request was read at all. Absent for a verdict Core settled from its own
   * arithmetic, which asks no model and reads no instruction --
   * `flow-version/instruction-digest.ts` says why that is recorded as unknown
   * rather than as the digest of an empty question.
   */
  instructionDigest?: string;
};

/** The verification, plus what the run produced and the first record set it judged. */
async function runVerification(input: AutomationStudioRuntimeSessionVerificationInput): Promise<AutomationStudioRuntimeSessionVerificationReport> {
  const session = input.session;
  let recordSets: AutomationStudioResultRecordSetInput[];
  try {
    recordSets = await readRecordSets(input.ports, input.projectId, session.runId);
  } catch (error) {
    // A result that could not be read is a result nobody checked, which is the
    // one thing this module refuses to report as success. The read's own code
    // is carried into the verdict so the run says what went wrong.
    return { outcome: unreadableResult(error), interventions: [] };
  }
  const summary = summarizeAutomationStudioRunResult({
    recordSets,
    ...(input.flow ? { flowNodes: input.flow.nodes } : {}),
    ...(input.ports.deniedEvidenceKeys !== undefined ? { deniedEvidenceKeys: input.ports.deniedEvidenceKeys } : {})
  });
  const datasetId = recordSets[0]?.summary.datasetId;
  const withResult = (report: { outcome: AutomationStudioResultVerificationOutcome; interventions: AutomationStudioRuntimeSessionVerificationReport["interventions"] }, instructionDigest?: string | null): AutomationStudioRuntimeSessionVerificationReport =>
    ({ ...report, summary, ...(datasetId !== undefined ? { datasetId } : {}), ...(instructionDigest ? { instructionDigest } : {}) });
  // Settled by Core's own counts: every row refused, or a stored row with no
  // value for a field the Flow's schema requires. Neither needs the request
  // read, so neither is worth a provider resolution or a call.
  if (automationStudioResultCoreObservation(summary)) {
    return withResult(await verifyAutomationStudioRunResult({ projectId: input.projectId, flowId: session.flowId, runId: session.runId, summary, instructions: [] }));
  }
  // From here a model is asked. The request and the steps that ran are read for
  // an empty result too: without them nothing can tell a Flow that searched and
  // found nothing from one that never looked.
  const instructions = await input.ports.flowInstructionSet({ projectId: input.projectId, flowId: session.flowId, ...(input.subflowId ? { subflowId: input.subflowId } : {}) });
  const instructionDigest = automationStudioFlowInstructionDigest(instructions);
  const resolved = await input.ports.resolveProvider?.({ projectId: input.projectId, flowId: session.flowId });
  const runDetail = await input.ports.getFlowRunDetail(input.projectId, session.runId);
  return withResult(await verifyAutomationStudioRunResult({
    projectId: input.projectId,
    flowId: session.flowId,
    runId: session.runId,
    ...(input.subflowId ? { subflowId: input.subflowId } : {}),
    summary,
    instructions,
    ...(runDetail ? { runDetail } : {}),
    ...(input.ports.deniedEvidenceKeys !== undefined ? { deniedEvidenceKeys: input.ports.deniedEvidenceKeys } : {}),
    ...(resolved ? { provider: resolved.provider } : {}),
    ...(input.policy ? { policy: input.policy } : {}),
    ...(resolved?.tokenLimits ? { tokenLimits: resolved.tokenLimits } : {}),
    ...(resolved?.timeoutMs !== undefined ? { timeoutMs: resolved.timeoutMs } : {}),
    ...(costCeiling(input, resolved) !== undefined ? { maxEstimatedCostUsd: costCeiling(input, resolved) } : {}),
    ...(input.signal ? { signal: input.signal } : {})
  }), instructionDigest);
}

/**
 * A verification that did not come back: its deadline passed, the run was
 * cancelled under it, or the attempt threw before any verdict.
 *
 * `performed: false`, so it is recorded `unverified` and never read as a pass,
 * and the run keeps the status its steps earned -- the same treatment a run gets
 * when no model is configured, and for the same reason: nobody judged this
 * result. The error's kind is named and its message is not, because a message
 * can carry what the store or the page was holding.
 */
function verificationDidNotFinish(reason: "timed_out" | "aborted" | "threw", error: unknown): AutomationStudioResultVerificationOutcome {
  const why = reason === "timed_out"
    ? "it did not finish inside its deadline"
    : reason === "aborted"
      ? "the run was cancelled while it was being judged"
      : `it failed before reaching a verdict (${errorName(error)})`;
  return {
    schemaVersion: "automation-studio.result-verification.v1",
    performed: false,
    code: AUTOMATION_STUDIO_RESULT_VERIFICATION_SKIP_CODES.notFinished,
    reason: `Whether this run's result answers the request was never judged: ${why}.`
  };
}

/** The narrower of what the caller allows this call and what the resolution allows it. */
function costCeiling(
  input: AutomationStudioRuntimeSessionVerificationInput,
  resolved: AutomationStudioResultVerificationProvider | undefined
): number | undefined {
  const ceilings = [input.maxEstimatedCostUsd, resolved?.maxEstimatedCostUsd].filter((value): value is number => typeof value === "number" && value > 0);
  return ceilings.length ? Math.min(...ceilings) : undefined;
}

/**
 * The run's stored record sets, each with the rows Core checks for required
 * values and, of those, the first few a sample may be drawn from.
 *
 * One read serves both: the check needs more rows than a sample does, and a
 * sample is the head of the same page. The sample keeps its own, smaller
 * source, so what the model may be shown -- and whether the summary calls
 * itself partial -- is exactly what it was before the check read further.
 */
async function readRecordSets(
  ports: AutomationStudioResultVerificationPorts,
  projectId: string,
  runId: string
): Promise<AutomationStudioResultRecordSetInput[]> {
  if (!ports.listRunDatasets) return [];
  const readPage = ports.getRunDatasetPage;
  const limits = AUTOMATION_STUDIO_RESULT_SUMMARY_LIMITS;
  const summaries = await ports.listRunDatasets({ projectId, runId });
  const listed = summaries.slice(0, limits.maxRecordSets);
  return await Promise.all(listed.map(async (summary) => {
    const page = readPage && summary.recordCount > 0
      ? await readPage({ projectId, runId, datasetId: summary.datasetId, limit: limits.maxRowsCheckedPerSet })
      : null;
    if (!page) return { summary };
    const checkedRows = page.rows.slice(0, limits.maxRowsCheckedPerSet);
    return { summary, schema: page.schema, rows: checkedRows.slice(0, limits.maxSampleRowsPerSet), checkedRows };
  }));
}

function unreadableResult(error: unknown): AutomationStudioResultVerificationOutcome {
  const code = "core.result.unreadable";
  const observation = `The run's stored records could not be read: ${errorName(error)}.`;
  return {
    schemaVersion: "automation-studio.result-verification.v1",
    performed: true,
    verdict: "unsure",
    basis: "model_unavailable",
    code,
    reason: "What the run produced could not be read, so whether it answers the request was never judged.",
    observation,
    failure: automationStudioResultFailureRecord({ verdict: "unsure", code, observation })
  };
}

/** The error's own name, never its message: a message can carry what the store was holding. */
function errorName(error: unknown): string {
  return error instanceof Error && error.name ? error.name : "unknown error";
}

/**
 * The verification as a run record holds it: verdicts, codes and Core's own
 * words, led by the one word a reader of the run acts on. `status` is what
 * keeps a result nobody judged from reading as a result that was right.
 * `verdicts` and `calls` say what each model call answered and how many were
 * made, so a result judged twice reads as such; they are absent when no model
 * was asked.
 *
 * **A refutation's directive is recorded, and only Core's half of it.**
 * `findings` and `fix` are Core's arithmetic and Core's sentences, so they belong
 * on a run like the observation beside them -- and a person or a later agent
 * reading a failed run is now told what to fix rather than only that something
 * was wrong. `judgement` is the model's reading of a medium whose contents Core
 * does not store, so it is deliberately not here; it reaches the repair inside
 * the failure record, which is where a sentence written outside Core travels
 * (`core-observation.ts` says why that is the only route). `withheld` is recorded
 * because it is a fact about the directive rather than a quotation: it says
 * something the check offered was screened out.
 */
function recordedOutcome(outcome: AutomationStudioResultVerificationOutcome): JsonObject {
  const status = automationStudioResultVerificationStatus(outcome);
  if (outcome.performed === false) return { status, performed: false, code: outcome.code, reason: outcome.reason };
  return {
    status,
    performed: true,
    verdict: outcome.verdict,
    basis: outcome.basis,
    code: outcome.code,
    reason: outcome.reason,
    observation: outcome.observation,
    ...(outcome.verdicts ? { verdicts: [...outcome.verdicts] } : {}),
    ...(outcome.calls !== undefined ? { calls: outcome.calls } : {}),
    ...(outcome.repair ? { repair: automationStudioRecordedResultRepair(outcome.repair) } : {})
  };
}

/**
 * The verdict, written against every version the run executed.
 *
 * Only a version with a revision number is offered. A graph Flow with no
 * revision chain -- one that existed before its graph was ever indexed -- is
 * carried on the run as `revision: null`, and null is not a version: writing it
 * as 0 would invent a predecessor nobody ever confirmed, which is exactly the
 * comparison the whole design refuses to make.
 *
 * A deployment with no store for these records nothing and says nothing. The
 * run's own detail still carries its version set, so which version a result
 * belongs to is still answerable there; only the history across runs is absent.
 */
async function recordFlowGraphJudgements(
  input: AutomationStudioRuntimeSessionVerificationInput,
  outcome: AutomationStudioResultVerificationOutcome,
  flowVersions: readonly AutomationStudioFlowGraphVersion[],
  instructionDigest: string | null,
  decidedAtMs: number
): Promise<void> {
  const record = input.ports.recordFlowGraphJudgements;
  if (!record) return;
  const versions = flowVersions.filter((version): version is AutomationStudioJudgedFlowGraphVersion => typeof version.revision === "number");
  if (!versions.length) return;
  await record({
    projectId: input.projectId,
    judgement: {
      runId: input.session.runId,
      status: automationStudioResultVerificationStatus(outcome),
      code: outcome.code,
      instructionDigest,
      decidedAtMs,
      versions
    }
  });
}

async function recordOnRunDetail(
  input: AutomationStudioRuntimeSessionVerificationInput,
  session: AutomationStudioRuntimeSession,
  outcome: AutomationStudioResultVerificationOutcome,
  interventions: Awaited<ReturnType<typeof verifyAutomationStudioRunResult>>["interventions"],
  flowVersions: readonly AutomationStudioFlowGraphVersion[]
): Promise<{ detail: AutomationStudioFlowRunDetail; askedNoModel: boolean } | undefined> {
  const detail = await input.ports.getFlowRunDetail(input.projectId, session.runId);
  if (!detail) return undefined;
  // In this save and no other, so the verdict and the run's zero cost are one write.
  const zeroGate = automationStudioZeroProviderGate(detail, interventions);
  const failed = outcome.performed === true && automationStudioResultVerificationFailsRun(outcome);
  const scheduled = recordedResultCheck(input, outcome);
  // Answered as well as saved, because the repair that may follow continues
  // from exactly this record: re-reading it would be a second read of a row
  // this call just wrote, and a repair built from a stale one would annotate a
  // run detail that no longer carries its own verdict.
  const recorded: AutomationStudioFlowRunDetail = {
    ...detail,
    summary: {
      ...detail.summary,
      status: session.status,
      updatedAt: session.finishedAt ?? detail.summary.updatedAt,
      // On the summary as well as the detail, because the summary is what the
      // run store writes its row from: `result_verification_status` and
      // `result_check_epoch` are read from exactly this, and they are what the
      // next run's schedule counts.
      ...(scheduled ? { metadata: { ...(detail.summary.metadata ?? {}), resultCheck: scheduled } } : {})
    },
    ...(interventions.length ? { interventions: [...detail.interventions, ...interventions] } : {}),
    metadata: {
      // The version set goes beside the verdict, not somewhere else: a reader
      // of one run has one place to look for what was judged and what it was
      // judged about. It is written from the session rather than left to the
      // detail's own projection, because a run whose detail was rebuilt from
      // some other source would otherwise carry a verdict about a version it
      // does not name.
      ...automationStudioMetadataWithFlowVersions(detail.metadata, flowVersions),
      resultVerification: recordedOutcome(outcome),
      ...(scheduled ? { resultCheck: scheduled } : {}),
      ...(failed && outcome.performed === true && outcome.failure ? { resultVerificationFailure: { category: outcome.failure.category, code: outcome.failure.code } } : {}),
      ...(zeroGate ? { llmGate: zeroGate } : {})
    }
  };
  await input.ports.saveFlowRunDetail(recorded);
  return { detail: recorded, askedNoModel: zeroGate !== undefined };
}

/**
 * Hands a run that asked no model anything to the replay recorder the service
 * lends. Evidence about the changes the run executed, never a condition of the
 * run: the run has finished, and a store that refused the write leaves each
 * change where it stood.
 */
async function recordAdaptationReplays(input: AutomationStudioRuntimeSessionVerificationInput, session: AutomationStudioRuntimeSession): Promise<void> {
  if (!session.trace || !input.ports.recordAdaptationReplays) return;
  try {
    await input.ports.recordAdaptationReplays({ projectId: input.projectId, flowId: session.flowId, runId: session.runId, checkedAt: session.finishedAt ?? Date.now(), trace: session.trace, ...(input.subflowId !== undefined ? { subflowId: input.subflowId } : {}) });
  } catch {
    /* best-effort: replay evidence never fails the finished run it describes */
  }
}
