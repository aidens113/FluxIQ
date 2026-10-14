// One partial trial of a subflow builder's proposal (automation-project-agents
// plan, `Subflow trial`; unit A4b). The validator side of `core.test_subflow`.
//
// 1. The predecessors' latest proposals, from the dispatcher
//    (`predecessorProposals`). One missing, or proposed against another plan,
//    runs nothing: the entry cannot be prepared. A proposal made under an
//    earlier plan of the build counts where the build says the plan in force
//    kept it (`keptUnder`, t590: an amendment that left that subflow as it
//    was, `project-agents/supervisor/state.ts`); one the amendment changed is
//    still stale.
// 2. The start, exactly as a whole candidate's trial makes it
//    (`./start.ts`): the deployment's start hook when it has one. When the
//    subflow trial gate holds the build's site reset, it asks the port to run
//    the hook first (`prepareStart`, `./port.ts`), then undoes the build's
//    own acts before it asks (`subflow-trial-gate.ts`, t578, as the whole
//    gate does); that start is handed in here and the hook is not run again,
//    and what the reset could not undo arrives as `startedWith`. Without the
//    gate's reset the hook runs here, and nothing undoes the build's acts but
//    the hook itself.
//    Then, given the domain's arrival (`arrival`) and a start location, the
//    run's first step loads the start location in the trial's tab, so the
//    trial starts on a loaded start page rather than on the page a builder
//    left (A8 bigbox debug, cause A: the hook reset the fixture's server state
//    but the tab still showed the builder's last page).
// 3. A runtime session of its own, marked `metadata.subflowTrial` with the
//    brief and the proposal it tries. Never `adaptiveRuntime`: a partial trial
//    is not an adaptive run and is admitted as a build's trial
//    (`../runtime-session/build-trial-admission.ts`).
// 4. The predecessors' proposals, then the target's, run detached and
//    explicitly partial (`runAutomationStudioDetachedSubflow`). A failed
//    predecessor means the target did not run; the trial says which.
// 5. A run that did not reach its end is not judged. One that did is judged by
//    the injected scoped judge, on the trial's own evidence and the brief's
//    scope.
//
// The answer is a partial receipt (`partial: true`, `scope: "subflow"`): it
// informs the builder and the supervisor and is never credit toward
// promotion. Feedback, the judge's summary, landed acts and frame evidence are
// the whole-candidate trial's own helpers, imported rather than copied.
//
// A cancelled build is not a verdict: the abort is thrown, before any judge
// call, as a whole candidate's trial throws it.

import { randomUUID } from "node:crypto";
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioRuntimeSession } from "../../../model/index.ts";
import type { AutomationStudioCandidateTrialAct } from "../../flow-bootstrap/candidate/index.ts";
import type { AutomationStudioSubflowProposal, AutomationStudioSubflowScope, AutomationStudioSubflowTrialRequest, AutomationStudioSubflowTrialResult } from "../../flow-bootstrap/subflow-candidate/index.ts";
import { runAutomationStudioDetachedSubflow, type AutomationStudioCandidateStartReceipt, type AutomationStudioDetachedSubflowIdentity, type AutomationStudioDetachedSubflowProposal } from "../../flow-bootstrap/verification/index.ts";
import { automationStudioResultReadAccounts, type AutomationStudioRunResultSummary } from "../../result-verification/index.ts";
import {
  automationStudioCandidateFrameEvidence,
  automationStudioCandidateTrialFeedback as Feedback,
  automationStudioCandidateTrialLandedActs,
  automationStudioCandidateTrialSummary,
  type AutomationStudioCandidateTrialStart
} from "../candidate-trial/index.ts";
import { automationStudioSubflowTrialStart } from "./start.ts";
import type { AutomationStudioSubflowTrialJudgeInput, AutomationStudioSubflowTrialPorts, AutomationStudioSubflowTrialRecord } from "./types.ts";

const NO_SPEND: AutomationStudioSubflowTrialRecord["judge"] = Object.freeze({ calls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 });

/** One partial trial's answer and Core's record of it. */
export type AutomationStudioSubflowTrialOutcome = { result: AutomationStudioSubflowTrialResult; record: AutomationStudioSubflowTrialRecord };

/**
 * Runs and judges one partial trial (header). `preparedStart` is the start the
 * port's `prepareStart` already made for this trial, ahead of the gate's reset
 * check; given, the hook is not run again.
 */
export async function runAutomationStudioSubflowTrial(request: AutomationStudioSubflowTrialRequest, ports: AutomationStudioSubflowTrialPorts, preparedStart?: AutomationStudioCandidateTrialStart): Promise<AutomationStudioSubflowTrialOutcome> {
  const { signal, scope, proposal } = request;
  signal.throwIfAborted();
  const now = ports.now ?? Date.now;
  const answer = answerFor(request);
  // A start the hook already made is recorded even when nothing then runs: the site was put back all the same.
  const notRun = { start: preparedStart ?? { status: "not_run" as const }, execution: "not_run" as const, entryPrepared: false, judge: { ...NO_SPEND } };
  // A proposal of another brief, plan or subflow runs nothing: its receipt would be credited to the wrong scope.
  if (!proposalOf(scope, proposal)) {
    const code = "subflow.trial_identity_mismatch";
    return answer("execution_failed", { code, partial: true, entryPrepared: false }, { ...notRun, code });
  }
  const predecessors = await ports.predecessorProposals(scope);
  const unprepared = unpreparedEntry(scope, predecessors, ports.keptUnder);
  if (unprepared) return answer("execution_failed", { ...unprepared, partial: true, entryPrepared: false }, { ...notRun, code: unprepared.code });
  const identity = await identityOf(scope, proposal, predecessors, ports);
  if (!identity) return answer("execution_failed", { code: "subflow.trial_build_gone", partial: true, entryPrepared: false }, { ...notRun, code: "subflow.trial_build_gone" });

  const start = preparedStart ?? await automationStudioSubflowTrialStart({ scope, revision: proposal.revision, digest: proposal.digest, signal }, ports);
  if (start.status === "failed") return answer("execution_failed", { code: start.code, start: start.status, partial: true, entryPrepared: false }, { ...notRun, start, code: start.code });

  const runId = ports.newRunId?.() ?? `subflow-trial.${randomUUID()}`;
  const marker = { buildId: scope.buildId, briefId: scope.briefId, subflowKey: scope.subflowKey, revision: proposal.revision, digest: proposal.digest };
  const opened = await ports.openSession({ runId, metadata: { subflowTrial: { ...marker } } });
  const startedAt = now();
  await ports.writeSession({ ...opened, status: "running", startedAt });
  const receipt: AutomationStudioCandidateStartReceipt = { receiptId: `${runId}.start`, conditionsDigest: `subflow-trial.${start.status}`, preparedAt: startedAt, pageGeneration: 0, subjectStates: [] };
  let executed: Awaited<ReturnType<typeof runAutomationStudioDetachedSubflow>>;
  try {
    executed = await (ports.execute ?? runAutomationStudioDetachedSubflow)({
      identity,
      target: detachedProposal(proposal),
      predecessors: predecessors.map(detachedProposal),
      currentIdentity: async () => identityOf(scope, proposal, await ports.predecessorProposals(scope), ports),
      parentFlow: await ports.parentFlow(),
      ...(ports.registry ? { registry: ports.registry } : {}),
      resolution: ports.resolution,
      snapshots: await ports.snapshots(),
      deprecatedPublicationIds: await ports.deprecatedPublicationIds(),
      sourceInstructionIds: [...ports.sourceInstructionIds],
      runId,
      start: receipt,
      // The start page loaded first, after the hook (header, t578).
      ...(ports.arrival && ports.startLocation ? { arrival: { ...ports.arrival, location: ports.startLocation } } : {}),
      // The signal rides on the options alone: the runner refuses two different signals.
      options: ports.graphOptions({ runId, signal })
    });
  } catch (error) {
    // Not left running: a session that threw is ended failed, and the throw goes on to the builder's gate.
    await ports.writeSession({ ...opened, status: signal.aborted ? "cancelled" : "failed", startedAt, finishedAt: now() });
    throw error;
  } finally {
    await ports.processDatasets(runId);
  }
  const ended: AutomationStudioRuntimeSession = {
    ...opened,
    status: executed.trace?.status ?? (executed.receipt.status === "succeeded" ? "succeeded" : executed.receipt.status === "cancelled" ? "cancelled" : "failed"),
    startedAt,
    finishedAt: executed.receipt.finishedAt,
    ...(executed.trace ? { trace: executed.trace } : {}),
    metadata: { ...(opened.metadata ?? {}), subflowTrial: { ...marker, start: start.status, execution: executed.receipt.status, entryPrepared: executed.entryPrepared, ...(executed.code ? { code: executed.code } : {}) } }
  };
  await ports.writeSession(ended);
  signal.throwIfAborted();
  const frames = automationStudioCandidateFrameEvidence(executed.trace?.attempts ?? [], executed.graph, executed.candidateGraphs);
  const shown = { trialRunId: runId, trace: executed.trace, graph: frames.graph, start: start.status };
  // Every lasting act that landed, the predecessors' included, for the build to undo before its next trial.
  const acts = automationStudioCandidateTrialLandedActs(executed.trace, frames.graph);
  const ran = { trialRunId: runId, start, entryPrepared: executed.entryPrepared, ...(executed.failedPredecessor ? { failedPredecessor: executed.failedPredecessor } : {}) };
  if (executed.receipt.status !== "succeeded") {
    const code = !executed.entryPrepared && executed.failedPredecessor ? "subflow.trial_predecessor_failed" : executed.code ?? `candidate.trial_${executed.receipt.status}`;
    const { reads } = automationStudioResultReadAccounts({ actionAttempts: ports.actionAttempts?.(ended)?.filter((attempt) => !attempt.subflowTarget), flowNodes: frames.graph?.nodes, deniedEvidenceKeys: ports.deniedEvidenceKeys });
    const failed = Feedback.executionFailed({ code, ...shown, reads });
    const feedback = { ...failed.feedback, partial: true, entryPrepared: executed.entryPrepared, ...entryWords(executed.failedPredecessor, executed.planIssues) };
    return answer(failed.verdict, feedback, { ...ran, execution: executed.receipt.status, code, judge: { ...NO_SPEND } }, acts);
  }
  let summary: AutomationStudioRunResultSummary;
  try {
    summary = await automationStudioCandidateTrialSummary({ recordSets: await ports.recordSets(runId), graph: frames.graph, trace: executed.trace,
      ...(ports.readEndView ? { readEndView: () => ports.readEndView!({ runId }) } : {}), actionAttempts: ports.actionAttempts?.(ended),
      observedStateKeys: ports.observedStateKeys, deniedEvidenceKeys: ports.deniedEvidenceKeys, ...(request.startedWith?.length ? { startedWith: request.startedWith } : {}) });
  } catch (error) {
    // What the run stored could not be read, so nobody can say whether it answers: not judged, and never a yes.
    const code = "candidate.trial_result_unreadable";
    const failure = error instanceof Error && error.name ? error.name : "unknown error";
    return answer("not_judged", { code, trialRunId: runId, start: start.status, failure, partial: true, entryPrepared: executed.entryPrepared }, { ...ran, execution: "succeeded", code, judge: { ...NO_SPEND } }, acts);
  }
  const successCheck = judgedCheck(scope, proposal);
  const verdict = await ports.judge({ summary, scope: structuredClone(scope) as AutomationStudioSubflowScope, ...(successCheck ? { successCheck } : {}) });
  signal.throwIfAborted();
  const read = Feedback.judged({ verdict, summary, ...shown });
  const { calls, inputTokens, outputTokens, totalTokens, estimatedCostUsd } = verdict.spent;
  return answer(read.verdict, { ...read.feedback, partial: true, entryPrepared: executed.entryPrepared }, { ...ran, execution: "succeeded", ...(read.code ? { code: read.code } : {}), judge: { calls, inputTokens, outputTokens, totalTokens, estimatedCostUsd } }, acts);
}

/** The proposal is bound to exactly this scope and heads with its subflow. */
function proposalOf(scope: AutomationStudioSubflowScope, proposal: Readonly<AutomationStudioSubflowProposal>): boolean {
  const bound = proposal.scope;
  return bound.buildId === scope.buildId && bound.briefId === scope.briefId && bound.planDigest === scope.planDigest && bound.subflowKey === scope.subflowKey
    && proposal.subflows[0]?.key === scope.subflowKey;
}

/** Why the entry cannot be prepared from these proposals, or nothing when it can. */
function unpreparedEntry(scope: AutomationStudioSubflowScope, predecessors: readonly AutomationStudioSubflowProposal[], keptUnder: AutomationStudioSubflowTrialPorts["keptUnder"]): { code: string; missing?: string[]; stale?: string[] } | undefined {
  const keys = predecessors.map((predecessor) => predecessor.scope.subflowKey);
  if (keys.length !== scope.predecessors.length || keys.some((key, index) => key !== scope.predecessors[index])) {
    return { code: "subflow.trial_predecessor_missing", missing: scope.predecessors.filter((key) => !keys.includes(key)) };
  }
  const current = (predecessor: AutomationStudioSubflowProposal) => predecessor.scope.planDigest === scope.planDigest || keptUnder?.(predecessor.scope.subflowKey, predecessor.scope.planDigest, scope.planDigest) === true;
  const stale = predecessors.filter((predecessor) => predecessor.scope.buildId !== scope.buildId || !current(predecessor)).map((predecessor) => predecessor.scope.subflowKey);
  return stale.length ? { code: "subflow.trial_predecessor_stale", stale } : undefined;
}

/** What the partial runner is bound to now; null once the build's plan is gone. */
async function identityOf(scope: AutomationStudioSubflowScope, proposal: Readonly<AutomationStudioSubflowProposal>, predecessors: readonly AutomationStudioSubflowProposal[], ports: AutomationStudioSubflowTrialPorts): Promise<AutomationStudioDetachedSubflowIdentity | null> {
  const planDigest = ports.currentPlanDigest ? await ports.currentPlanDigest(scope.buildId) : scope.planDigest;
  if (planDigest === null) return null;
  return {
    projectId: ports.projectId,
    flowId: ports.flowId,
    buildId: scope.buildId,
    briefId: scope.briefId,
    planDigest,
    baseDependencyDigest: await ports.currentBaseDigest(),
    target: { subflowKey: proposal.scope.subflowKey, revision: proposal.revision, digest: proposal.digest },
    predecessors: predecessors.map((predecessor) => ({ subflowKey: predecessor.scope.subflowKey, revision: predecessor.revision, digest: predecessor.digest }))
  };
}

function detachedProposal(proposal: Readonly<AutomationStudioSubflowProposal>): AutomationStudioDetachedSubflowProposal {
  return { subflowKey: proposal.scope.subflowKey, revision: proposal.revision, digest: proposal.digest, subflows: structuredClone(proposal.subflows) as AutomationStudioDetachedSubflowProposal["subflows"] };
}

/** What the model is told about an entry a predecessor did not prepare, or a composed topology validation refused. */
function entryWords(failedPredecessor: string | undefined, planIssues: readonly string[] | undefined): JsonObject {
  if (failedPredecessor) {
    return { failedPredecessor, entry: `Predecessor subflow ${failedPredecessor} failed while preparing this subflow's entry, so this subflow did not run. Its own steps were not tested.` };
  }
  return planIssues?.length ? { planIssues: [...planIssues] } : {};
}

/** The builder's answer and Core's record of one partial trial of `request`'s proposal. */
function answerFor(request: AutomationStudioSubflowTrialRequest) {
  const identity = { buildId: request.scope.buildId, briefId: request.scope.briefId, planDigest: request.scope.planDigest, subflowKey: request.scope.subflowKey };
  return (
    verdict: AutomationStudioSubflowTrialResult["verdict"],
    feedback: JsonObject,
    record: Omit<AutomationStudioSubflowTrialRecord, "identity" | "revision" | "digest" | "verdict"> & { start: AutomationStudioCandidateTrialStart | { status: "not_run" } },
    acts: AutomationStudioCandidateTrialAct[] = []
  ): AutomationStudioSubflowTrialOutcome => ({
    result: {
      partial: true,
      scope: "subflow",
      identity: { ...identity },
      revision: request.proposal.revision,
      digest: request.proposal.digest,
      verdict,
      feedback,
      ...(record.trialRunId ? { trialRunId: record.trialRunId } : {}),
      entryPrepared: record.entryPrepared,
      ...(acts.length ? { acts } : {})
    },
    record: { identity: { ...identity }, revision: request.proposal.revision, digest: request.proposal.digest, verdict, ...record }
  });
}

/** The check the trial is judged against: the plan's, or with none the one the tried proposal's own subflow carries, its builder's (`./types.ts`, t569). */
function judgedCheck(scope: AutomationStudioSubflowScope, proposal: AutomationStudioSubflowTrialRequest["proposal"]): AutomationStudioSubflowTrialJudgeInput["successCheck"] {
  if (scope.successCheck?.length) return { check: structuredClone(scope.successCheck), from: "plan" };
  const proposed = proposal.subflows.find((subflow) => subflow.key === scope.subflowKey)?.metadata?.["fluxiq.successCheck"];
  return proposed?.length ? { check: structuredClone(proposed), from: "builder" } : undefined;
}
