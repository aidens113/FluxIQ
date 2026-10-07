// Running a Flow again once a repair has changed it.
//
// **Why one module for two repairs.** A failed step and a wrong answer are
// repaired differently and re-run identically: read the Flow back from storage
// now that the change has landed, run it, and hand the run that produced back
// to whoever is judging it. Writing that twice is how the two would come to
// disagree about what a re-run *is* -- which trace the run keeps, whose
// metadata it carries, whether the run id survives. So there is one function
// and the two callers differ by one word.
//
// `resume` is the failed step's re-run: the ladder patched a node, the adaptive
// retry decides whether the run may be resumed and from which node, and
// execution picks up there -- on the unapplied candidate, since a runtime patch
// reaches the stored Flow only once this run's result is judged to answer
// (`./judged-promotion.ts`, t249). `start` is the wrong answer's: nothing failed, so
// there is no node to resume from and no retry budget to consult -- the Flow
// was *edited*, and an edited Flow has to be run from the beginning or the new
// step never runs at all.
//
// **The run id survives, and that is what bounds the loop.** A re-run is the
// same run continuing, not a new one, so it keeps its id and its metadata is
// carried forward over the rebuilt detail. Everything the first pass wrote
// therefore outlives the rebuild -- including the marker saying this run's
// result has already been repaired once (`recovery/refuted-result/repair.ts`),
// which is the whole reason a repaired run cannot be repaired again. Drop the
// carry-forward and a Flow that answers wrongly twice repairs itself forever.
//
// It was a private method on `AutomationStudioService`, where the second caller
// could not have been added: that file is at its line ratchet, and the wrong
// answer's re-run is the same ninety lines with one branch in them.
//
// **A held re-author runs unapplied (t267).** Both re-author routes hold their
// approved edit (`./reauthor-build.ts`), so a `start` re-run whose latest
// re-author is held runs the held graph as its candidate, or refuses the pass
// where it cannot be run alone (`./held-candidate.ts`), and names the held edit it
// ran for the run's judged end to settle (`./judged-reauthor.ts`).

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type {
  AutomationStudioFlowAdaptation,
  AutomationStudioFlowArtifact,
  AutomationStudioFlowDocument,
  AutomationStudioFlowRunDetail,
  AutomationStudioFlowSubflow,
  AutomationStudioPublishedFlowSnapshot,
  AutomationStudioRuntimeSession
} from "../../../model/index.ts";
import { runCanonicalAutomationStudioFlow } from "../../composite-executor.ts";
import type { AutomationStudioGraphExecutionOptions, AutomationStudioGraphExecutionTrace } from "../../executor.ts";
import type { AutomationStudioBootstrapAdaptation } from "../../flow-bootstrap/index.ts";
import { automationStudioRefutedResultFlowWasReauthored, automationStudioRefutedResultHeldReauthor } from "../../recovery/refuted-result/index.ts";
import { decideAutomationStudioAdaptiveRetry } from "../adaptations/index.ts";
import { automationStudioFlowGraphVersion, automationStudioFlowVersionsFromMetadata, automationStudioMetadataWithFlowVersions, automationStudioRunFlowVersions } from "../../flow-version/index.ts";
import { canonicalFlowDocument } from "../flows/index.ts";
import { isTerminalRuntimeSessionStatus, type AutomationStudioRunRecoveryState } from "../runtime-session/index.ts";
import { runtimeSessionToFlowRunDetail } from "../summaries/index.ts";
import { runtimeRunDetailWithAdaptationContext } from "./context.ts";
import type { AutomationStudioRuntimeAdaptationContext } from "./contracts.ts";
import {
  automationStudioAwaitsJudgedRun,
  automationStudioJudgedPromotionCandidate,
  automationStudioRunAdaptationIds,
  settleAutomationStudioJudgedPromotions,
  type AutomationStudioJudgedPromotionPorts
} from "./judged-promotion.ts";
import { automationStudioHeldReauthorCandidate } from "./held-candidate.ts";
import { AUTOMATION_STUDIO_HELD_REAUTHOR_RAN_KEY } from "./judged-reauthor.ts";

/**
 * What the service lends a re-run: the reads it makes, the two writes it lands,
 * and the adaptation reads and writes a runtime patch's deferred promotion
 * needs (`./judged-promotion.ts`).
 */
export type AutomationStudioRepairRerunPorts = AutomationStudioJudgedPromotionPorts & {
  getFlowSubflow(projectId: string, flowId: string, subflowId: string): Promise<AutomationStudioFlowSubflow | null>;
  getFlow(projectId: string, flowId: string): Promise<AutomationStudioFlowArtifact>;
  /** Refuses a Subflow graph this parent does not own, before anything is run. */
  assertOwnedSubflowGraph(projectId: string, flow: AutomationStudioFlowArtifact): Promise<void>;
  listPublishedFlowSnapshots(): Promise<AutomationStudioPublishedFlowSnapshot[]>;
  deprecatedPublicationIds(): Promise<string[]>;
  writeRuntimeSession(projectId: string, session: AutomationStudioRuntimeSession): Promise<unknown>;
  saveFlowRunDetail(detail: AutomationStudioFlowRunDetail): Promise<unknown>;
  /** A held re-author's record, whose graph the re-run runs unapplied. */
  getFlowBootstrapAdaptation(projectId: string, flowId: string, adaptationId: string): Promise<AutomationStudioBootstrapAdaptation | null>;
  /** Legacy compatibility port; re-runs never apply held re-authors before judgement. */
  applyFlowBootstrapAdaptation(input: { projectId: string; flowId: string; adaptationId: string; actorId: string }): Promise<unknown>;
};

export type AutomationStudioRepairRerunInput = {
  ports: AutomationStudioRepairRerunPorts;
  projectId: string;
  session: AutomationStudioRuntimeSession;
  detail: AutomationStudioFlowRunDetail;
  /** Optional because the run's own options are, and an absent one runs with the defaults. */
  graphOptions?: AutomationStudioGraphExecutionOptions | undefined;
  adaptationContext: AutomationStudioRuntimeAdaptationContext;
  subflowId?: string | undefined;
  /**
   * Where the re-run begins.
   *
   * `resume` picks up at the node the adaptive retry says it may, and is
   * declined when that retry says no. `start` runs the whole Flow, and consults
   * no retry budget, because the Flow itself is different from the one that ran.
   */
  from: "resume" | "start";
};

export type AutomationStudioRepairRerunResult = {
  session?: AutomationStudioRuntimeSession;
  /**
   * The *changed* document the re-run actually ran. It is answered because the
   * verification that follows was handed the Flow from before the change, so
   * its `resultSummary.flowShape` described a repaired run by the graph it no
   * longer had.
   */
  flow?: AutomationStudioFlowDocument;
  declinedCode?: string;
};

/**
 * Runs the Flow again, as it now stands, and answers the run that produced --
 * or nothing when there is nothing to re-run.
 */
export async function rerunAutomationStudioSessionAfterRepair(
  input: AutomationStudioRepairRerunInput
): Promise<AutomationStudioRepairRerunResult | null> {
  if (input.session.status !== "failed") return null;
  // Only a resumed run is rationed. A re-run of an edited Flow is not a retry
  // of the same work: the Flow changed, so the attempt count of the old one
  // says nothing about whether this one should happen.
  const decision = input.from === "resume"
    ? decideAutomationStudioAdaptiveRetry({ runtimePatchAttempts: input.detail.metadata?.runtimePatchAttempts, ...(input.subflowId ? { subflowId: input.subflowId } : {}) })
    : undefined;
  // A trial that ran the Flow to its end leaves nothing to resume, and it is
  // already the whole run: it began at the Flow's start and finished on the
  // candidate. Its own pass is adopted as the resumed pass, with nothing run
  // again (t249), where its receipt carries it (`recovery/annotation/patches.ts`).
  let adopted: AutomationStudioGraphExecutionTrace | undefined;
  if (input.from === "resume") {
    if (!decision) return null;
    if ("declined" in decision) {
      adopted = decision.declined.notResumableCode === "resume_point_completed" ? trialCompletedTrace(input.detail) : undefined;
      if (!adopted) return { declinedCode: decision.declined.notResumableCode };
    }
  }
  const resumeNodeId = decision && !("declined" in decision) ? decision.resume.nodeId : undefined;
  const rerunStartedAt = Date.now();
  const reauthored = input.from === "start" && automationStudioRefutedResultFlowWasReauthored(input.detail);
  // A held re-author runs unapplied or declines before any writes or dispatch.
  const heldId = reauthored ? automationStudioRefutedResultHeldReauthor(input.detail) : undefined;
  const held = heldId ? await automationStudioHeldReauthorCandidate(input, heldId) : undefined;
  if (held && "unsupportedTopology" in held) return { declinedCode: `repair_rerun.held_reauthor_unsupported.${held.unsupportedTopology}` };
  if (held && "unreadable" in held) return { declinedCode: UNREADABLE[held.unreadable] };
  const found = held && "flow" in held ? held : await changedFlow(input);
  if ("declinedCode" in found) return found;
  const updatedFlow = found.flow;
  const ranHeld = held && "flow" in held ? heldId : undefined;
  if (input.subflowId) await input.ports.assertOwnedSubflowGraph(input.projectId, updatedFlow);
  // Every pass runs the unapplied candidate: the stored Flow with this run's
  // pending runtime patches written onto it, unsaved. Nothing is applied until
  // the run's result is judged. Before a re-run from the start, a patch an
  // earlier pass already ran is settled on that pass's ending, so this pass's
  // verdict never stands for it. A re-authored Flow settles every pending patch
  // first: they were written for the graph before. Otherwise the re-run is the
  // whole-Flow pass for the patches the refuted result's repair wrote, which had
  // no failed step to resume from.
  const settled = input.from === "start"
    ? await settleAutomationStudioJudgedPromotions({ ports: input.ports, projectId: input.projectId, flowId: input.adaptationContext.flowId, session: input.session, detail: input.detail, ...(reauthored ? {} : { only: "ran" as const }) })
    : input.detail;
  const detail = settled;
  const candidate = reauthored ? { flow: updatedFlow, adaptationIds: [] } : await pendingCandidate({ ...input, detail }, updatedFlow);
  if ("declinedCode" in candidate) return candidate;
  if (input.from === "start" && !reauthored && !candidate.adaptationIds.length) return { declinedCode: UNREADABLE.nothingToRerun };
  const retryTrace = adopted ?? await runCanonicalAutomationStudioFlow(
    candidate.flow,
    await input.ports.listPublishedFlowSnapshots(),
    // Numbered after the first pass's attempts: the re-run is kept under the
    // same run id, and an attempt id it repeated would be dropped by the store.
    { ...(input.graphOptions ?? {}), priorAttemptCount: input.session.trace?.attempts.length ?? 0, ...(resumeNodeId ? { startNodeId: resumeNodeId } : {}) },
    await input.ports.deprecatedPublicationIds()
  );
  const retrySession: AutomationStudioRuntimeSession = {
    ...input.session,
    status: retryTrace.status,
    finishedAt: retryTrace.finishedAt ?? Date.now(),
    // The repair moved the graph, so the run's version set has to move with it.
    // `changedFlow` read the Flow back through `getFlow`, which materializes
    // from the graph chain, so `updatedFlow` already carries the revision the
    // re-run actually executed. Restating the one entry leaves every other
    // graph the run entered exactly as it was -- the orchestration Flow does
    // not move when a Subflow's graph is rewritten, and claiming it did would
    // sever the parent from its own history.
    // Which held re-author this pass ran, if any, for the judged end to settle; a pass that ran none clears an earlier pass's.
    metadata: automationStudioMetadataWithFlowVersions(withHeldReauthorRan(input.session.metadata, ranHeld), automationStudioRunFlowVersions([
      ...automationStudioFlowVersionsFromMetadata(input.session.metadata),
      automationStudioFlowGraphVersion({ flow: updatedFlow, ...(input.subflowId ? { subflowId: input.subflowId } : {}) })
    ])),
    trace: {
      ...retryTrace,
      attempts: [...(input.session.trace?.attempts ?? []), ...retryTrace.attempts],
      effects: [...(input.session.trace?.effects ?? []), ...retryTrace.effects],
      message: `${adopted ? "Trial ran the Flow to its end," : input.from === "resume" ? "Adaptive retry" : "Repaired re-run"} ${retryTrace.status}.${input.session.trace?.message ? ` Initial failure: ${input.session.trace.message}` : ""}`
    }
  };
  await input.ports.writeRuntimeSession(input.projectId, retrySession);
  const retriedSubflows = detail.subflows.map((entry) => {
    if (!input.subflowId || entry.subflowId !== input.subflowId) return entry;
    const { failureReason: _initialFailureReason, ...retainedMetadata } = entry.metadata ?? {};
    const finishedAt = retryTrace.finishedAt ?? Date.now();
    return {
      ...entry,
      exitedAt: finishedAt,
      status: retryTrace.status,
      metadata: {
        ...retainedMetadata,
        durationMs: Math.max(0, finishedAt - entry.enteredAt),
        adaptiveRetryAttemptCount: retryTrace.attempts.length,
        ...(retryTrace.status !== "succeeded" && retryTrace.message ? { failureReason: retryTrace.message } : {})
      }
    };
  });
  const retryBase = runtimeSessionToFlowRunDetail(retrySession, input.projectId);
  const retryDetail = runtimeRunDetailWithAdaptationContext({
    ...retryBase,
    summary: {
      ...retryBase.summary,
      routeDecisionCount: detail.routeDecisions.length,
      subflowEntryCount: retriedSubflows.length
    },
    routeDecisions: detail.routeDecisions,
    subflows: retriedSubflows
  }, input.adaptationContext);
  await input.ports.saveFlowRunDetail({
    ...retryDetail,
    interventions: detail.interventions,
    adaptationIds: detail.adaptationIds,
    changeProposalIds: detail.changeProposalIds,
    metadata: {
      // The run's own metadata over the rebuilt detail's: everything the first
      // pass recorded survives the rebuild, which is what stops a repaired run
      // being repaired a second time.
      ...(retryDetail.metadata ?? {}),
      ...(detail.metadata ?? {}),
      ...(adopted ? { runtimePatchAttempts: receiptsWithoutTrialTraces(detail) } : {}),
      [input.from === "resume" ? "adaptiveRetry" : "repairedRerun"]: {
        attempted: true,
        status: retryTrace.status,
        attemptCount: retryTrace.attempts.length,
        ...(adopted ? { trialCompleted: true } : {}),
        // The pending patches this pass ran, which the judged-promotion settle reads.
        ...(candidate.adaptationIds.length ? { candidateAdaptationIds: candidate.adaptationIds } : {}),
        // The held re-author this pass ran unapplied (`./judged-reauthor.ts`).
        ...(ranHeld ? { [AUTOMATION_STUDIO_HELD_REAUTHOR_RAN_KEY]: ranHeld } : {})
      },
      ...rerunRecoveryState(detail, retryTrace.status, rerunStartedAt, retryTrace.finishedAt ?? Date.now())
    }
  });
  return { session: retrySession, flow: canonicalFlowDocument(candidate.flow) };
}

/**
 * The candidate a pass runs, or why it could not be built. A pending patch
 * that cannot be read, or cannot be written onto the Flow it was trialled on,
 * declines the pass: running the stored Flow instead would put a run the patch
 * never took part in up for the judgement that keeps it.
 */
async function pendingCandidate(
  input: AutomationStudioRepairRerunInput,
  flow: AutomationStudioFlowArtifact
): Promise<{ flow: AutomationStudioFlowArtifact; adaptationIds: string[] } | { declinedCode: string }> {
  const recordedIds = automationStudioRunAdaptationIds(input.detail);
  if (!recordedIds.length) return { flow, adaptationIds: [] };
  let adaptations: AutomationStudioFlowAdaptation[];
  try {
    const read = await Promise.all(recordedIds.map((adaptationId) => input.ports.getFlowAdaptation(input.projectId, input.adaptationContext.flowId, adaptationId)));
    adaptations = read.filter((adaptation): adaptation is AutomationStudioFlowAdaptation => adaptation !== null && automationStudioAwaitsJudgedRun(adaptation, input.session.runId));
  } catch {
    return { declinedCode: UNREADABLE.candidate };
  }
  try {
    return automationStudioJudgedPromotionCandidate({ flow, adaptations, subflowId: input.subflowId });
  } catch {
    return { declinedCode: UNREADABLE.candidateUnwritable };
  }
}

/** The session's metadata naming the held re-author this pass ran, or with no such name when it ran none. */
function withHeldReauthorRan(metadata: JsonObject | undefined, adaptationId: string | undefined): JsonObject {
  const { [AUTOMATION_STUDIO_HELD_REAUTHOR_RAN_KEY]: _earlierPass, ...kept } = metadata ?? {};
  return adaptationId ? { ...kept, [AUTOMATION_STUDIO_HELD_REAUTHOR_RAN_KEY]: adaptationId } : kept;
}

/**
 * The trial's own pass, when a trial on a patch allowed unattended ran the Flow
 * to its end: the last such receipt's saved trace. Nothing when no receipt
 * carries one, which declines the resume as before.
 */
function trialCompletedTrace(detail: AutomationStudioFlowRunDetail): AutomationStudioGraphExecutionTrace | undefined {
  const attempts = Array.isArray(detail.metadata?.runtimePatchAttempts) ? detail.metadata.runtimePatchAttempts : [];
  for (const attempt of [...attempts].reverse()) {
    if (!attempt || typeof attempt !== "object" || Array.isArray(attempt)) continue;
    const trace = attempt.completedTrace;
    if (trace && typeof trace === "object" && !Array.isArray(trace) && Array.isArray(trace.attempts) && typeof trace.status === "string") return trace as unknown as AutomationStudioGraphExecutionTrace;
  }
  return undefined;
}

/** The run's receipts, without the trial pass the resume has now adopted into the run's own trace. */
function receiptsWithoutTrialTraces(detail: AutomationStudioFlowRunDetail): JsonValue[] {
  const attempts = Array.isArray(detail.metadata?.runtimePatchAttempts) ? detail.metadata.runtimePatchAttempts : [];
  return attempts.map((attempt) => {
    if (!attempt || typeof attempt !== "object" || Array.isArray(attempt) || !("completedTrace" in attempt)) return attempt;
    const { completedTrace: _adopted, ...kept } = attempt;
    return kept;
  });
}

/**
 * The recovery marker a finished re-run's detail carries
 * (`metadata.recoveryState`, `runtime-session/recovery-state.ts`).
 *
 * A reader of a failed run waits for Core's recovery to say it is over. A
 * resumed re-run inherits that from the recovery that repaired it: the ladder's
 * detail already says `ended`, and the carry-forward keeps it. A re-run of a
 * re-authored Flow inherits nothing, because its first pass succeeded and no
 * recovery ever ran; its failure then read as a recovery still to come, and the
 * Lab waited five minutes for a record Core was never going to write
 * (`run-munw7ffn-fe1cecd2`). Nothing recovers a re-run -- a repaired run is not
 * repaired again -- so a finished one says its recovery has ended. A marker the
 * first pass already wrote is kept, since it describes the recovery that ran.
 */
function rerunRecoveryState(
  detail: AutomationStudioFlowRunDetail,
  status: AutomationStudioRuntimeSession["status"],
  startedAt: number,
  endedAt: number
): { recoveryState?: AutomationStudioRunRecoveryState } {
  if (!isTerminalRuntimeSessionStatus(status)) return {};
  const existing = detail.metadata?.recoveryState as { state?: unknown } | undefined;
  if (existing && typeof existing === "object" && (existing.state === "ended" || existing.state === "threw")) return {};
  return { recoveryState: { state: "ended", startedAt, endedAt: Math.max(startedAt, endedAt) } };
}

/**
 * Why a Flow could not be read back for the re-run. Each one is carried out to
 * the run as its `declinedCode`, because a re-run that did not happen and a
 * repair that had nothing to re-run are different facts: this used to answer
 * `null` for every one of them, and a storage failure then read as "there was
 * nothing to do".
 */
const UNREADABLE = {
  flow: "repair_rerun.flow_unreadable",
  subflow: "repair_rerun.subflow_unreadable",
  subflowAbsent: "repair_rerun.subflow_absent",
  graph: "repair_rerun.subflow_graph_unreadable",
  nothingToRerun: "repair_rerun.nothing_to_rerun",
  candidate: "repair_rerun.candidate_unreadable",
  candidateUnwritable: "repair_rerun.candidate_unwritable",
  heldReauthor: "repair_rerun.held_reauthor_unreadable"
} as const;

/** The Flow as it now stands: the Subflow's graph where one ran, else the Flow itself. */
async function changedFlow(
  input: AutomationStudioRepairRerunInput
): Promise<{ flow: AutomationStudioFlowArtifact } | { declinedCode: string }> {
  if (!input.subflowId) {
    try {
      return { flow: await input.ports.getFlow(input.projectId, input.session.flowId) };
    } catch {
      return { declinedCode: UNREADABLE.flow };
    }
  }
  let selectedSubflow: AutomationStudioFlowSubflow | null;
  try {
    selectedSubflow = await input.ports.getFlowSubflow(input.projectId, input.session.flowId, input.subflowId);
  } catch {
    return { declinedCode: UNREADABLE.subflow };
  }
  if (!selectedSubflow?.graphFlowId) return { declinedCode: UNREADABLE.subflowAbsent };
  let updatedFlow: AutomationStudioFlowArtifact;
  try {
    updatedFlow = await input.ports.getFlow(input.projectId, selectedSubflow.graphFlowId);
  } catch {
    return { declinedCode: UNREADABLE.graph };
  }
  // Ownership is never declined: a graph this parent does not own is a fault,
  // not an absence, and running it would run somebody else's Flow.
  if (updatedFlow.metadata?.parentFlowId !== input.session.flowId
    || updatedFlow.metadata?.parentSubflowId !== input.subflowId) {
    throw new Error("Adaptive retry Subflow graph ownership no longer matches the selected parent and Subflow.");
  }
  return { flow: updatedFlow };
}
