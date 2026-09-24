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
// execution picks up there. `start` is the wrong answer's: nothing failed, so
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

import type {
  AutomationStudioFlowArtifact,
  AutomationStudioFlowDocument,
  AutomationStudioFlowRunDetail,
  AutomationStudioFlowSubflow,
  AutomationStudioPublishedFlowSnapshot,
  AutomationStudioRuntimeSession
} from "../../../model/index.ts";
import { runCanonicalAutomationStudioFlow } from "../../composite-executor.ts";
import type { AutomationStudioGraphExecutionOptions } from "../../executor.ts";
import { decideAutomationStudioAdaptiveRetry } from "../adaptations/index.ts";
import { canonicalFlowDocument } from "../flows/index.ts";
import { runtimeSessionToFlowRunDetail } from "../summaries/index.ts";
import { runtimeRunDetailWithAdaptationContext } from "./context.ts";
import type { AutomationStudioRuntimeAdaptationContext } from "./contracts.ts";

/** What the service lends a re-run: the reads it makes and the two writes it lands. */
export type AutomationStudioRepairRerunPorts = {
  getFlowSubflow(projectId: string, flowId: string, subflowId: string): Promise<AutomationStudioFlowSubflow | null>;
  getFlow(projectId: string, flowId: string): Promise<AutomationStudioFlowArtifact>;
  /** Refuses a Subflow graph this parent does not own, before anything is run. */
  assertOwnedSubflowGraph(projectId: string, flow: AutomationStudioFlowArtifact): Promise<void>;
  listPublishedFlowSnapshots(): Promise<AutomationStudioPublishedFlowSnapshot[]>;
  deprecatedPublicationIds(): Promise<string[]>;
  writeRuntimeSession(projectId: string, session: AutomationStudioRuntimeSession): Promise<unknown>;
  saveFlowRunDetail(detail: AutomationStudioFlowRunDetail): Promise<unknown>;
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
  if (input.from === "resume") {
    if (!decision) return null;
    if ("declined" in decision) return { declinedCode: decision.declined.notResumableCode };
  }
  const resumeNodeId = decision && !("declined" in decision) ? decision.resume.nodeId : undefined;
  const found = await changedFlow(input);
  if ("declinedCode" in found) return found;
  const updatedFlow = found.flow;
  if (input.subflowId) await input.ports.assertOwnedSubflowGraph(input.projectId, updatedFlow);
  const retryTrace = await runCanonicalAutomationStudioFlow(
    updatedFlow,
    await input.ports.listPublishedFlowSnapshots(),
    { ...(input.graphOptions ?? {}), ...(resumeNodeId ? { startNodeId: resumeNodeId } : {}) },
    await input.ports.deprecatedPublicationIds()
  );
  const retrySession: AutomationStudioRuntimeSession = {
    ...input.session,
    status: retryTrace.status,
    finishedAt: retryTrace.finishedAt ?? Date.now(),
    trace: {
      ...retryTrace,
      attempts: [...(input.session.trace?.attempts ?? []), ...retryTrace.attempts],
      effects: [...(input.session.trace?.effects ?? []), ...retryTrace.effects],
      message: `${input.from === "resume" ? "Adaptive retry" : "Repaired re-run"} ${retryTrace.status}.${input.session.trace?.message ? ` Initial failure: ${input.session.trace.message}` : ""}`
    }
  };
  await input.ports.writeRuntimeSession(input.projectId, retrySession);
  const retriedSubflows = input.detail.subflows.map((entry) => {
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
      routeDecisionCount: input.detail.routeDecisions.length,
      subflowEntryCount: retriedSubflows.length
    },
    routeDecisions: input.detail.routeDecisions,
    subflows: retriedSubflows
  }, input.adaptationContext);
  await input.ports.saveFlowRunDetail({
    ...retryDetail,
    interventions: input.detail.interventions,
    adaptationIds: input.detail.adaptationIds,
    changeProposalIds: input.detail.changeProposalIds,
    metadata: {
      // The run's own metadata over the rebuilt detail's: everything the first
      // pass recorded survives the rebuild, which is what stops a repaired run
      // being repaired a second time.
      ...(retryDetail.metadata ?? {}),
      ...(input.detail.metadata ?? {}),
      [input.from === "resume" ? "adaptiveRetry" : "repairedRerun"]: {
        attempted: true,
        status: retryTrace.status,
        attemptCount: retryTrace.attempts.length
      }
    }
  });
  return { session: retrySession, flow: canonicalFlowDocument(updatedFlow) };
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
  graph: "repair_rerun.subflow_graph_unreadable"
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
