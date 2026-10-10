import { parseAutomationStudioFailureRecord } from "@fluxiq/contracts/automation-studio";
import type { AutomationStudioBootstrapAdaptation } from "../../flow-bootstrap/index.ts";
import type { AutomationStudioAdaptationSummary } from "../indexes/index.ts";
import type { JsonObject } from "../../../../../core/index.ts";
import type {
  AutomationStudioFlowAdaptation,
  AutomationStudioFlowInstruction,
  AutomationStudioFlowIntervention,
  AutomationStudioFlowRunActionAttemptRecord,
  AutomationStudioFlowRunDetail,
  AutomationStudioFlowRunRecoveryRecord,
  AutomationStudioFlowRunSummary,
  AutomationStudioRuntimeSession
} from "../../../model/index.ts";
import type { AutomationStudioRuntimeRunSummary } from "../../../storage/index.ts";
import { automationStudioFlowVersionsFromMetadata, automationStudioMetadataWithFlowVersions } from "../../flow-version/index.ts";
import { classifyAutomationStudioAdaptiveFailure, compactAutomationStudioAdaptiveFailure } from "../../adaptive-orchestrator.ts";
import { automationStudioAttemptSettled } from "../../flow-change/index.ts";
import type { AutomationStudioInstructionSummary } from "../indexes/index.ts";
import { automationStudioRunChangedDurableBehavior } from "../../durable-behavior/index.ts";
import { isJsonRecord, jsonObjectFromUnknown, stringOrNull } from "../json-values.ts";
import { extractionSummaryFromOutputs } from "./extraction-summary.ts";
import { automationStudioRunFailureCounts } from "./failure-counts.ts";
import { hostTargetResolutionFromOutputs } from "./host-target-resolution.ts";
import { automationStudioRunDetailRecoveryTrace } from "./recovery-trace.ts";
import { automationStudioRunDetailStateRouting } from "./state-routing.ts";

// Converting a runtime session into the run detail, summaries and intervention
// records that the summary indexes and the public run views are built from.
export const SUBFLOW_SUMMARY_MIGRATION_IO_CONCURRENCY = 16;

export function flowRunSummaryWithInterventionSummaries(detail: AutomationStudioFlowRunDetail): AutomationStudioFlowRunSummary {
  type TokenUsageSummary = NonNullable<AutomationStudioFlowRunSummary["tokenUsage"]>;
  const interventionSummaries = (detail.interventions ?? []).map((intervention) => ({
    interventionId: intervention.interventionId,
    kind: intervention.kind,
    reason: intervention.reason,
    ...(intervention.promptVersion ? { promptVersion: intervention.promptVersion } : {}),
    ...(intervention.provider ? { provider: intervention.provider } : {}),
    ...(intervention.model ? { model: intervention.model } : {}),
    ...(intervention.tokenUsage ? { tokenUsage: intervention.tokenUsage } : {})
  }));
  const tokenUsage: TokenUsageSummary = interventionSummaries.length ? interventionSummaries.reduce<TokenUsageSummary>((sum, intervention) => ({
    inputTokens: (sum.inputTokens ?? 0) + (intervention.tokenUsage?.inputTokens ?? 0),
    outputTokens: (sum.outputTokens ?? 0) + (intervention.tokenUsage?.outputTokens ?? 0),
    totalTokens: (sum.totalTokens ?? 0) + (intervention.tokenUsage?.totalTokens ?? 0),
    estimatedCostUsd: (sum.estimatedCostUsd ?? 0) + (intervention.tokenUsage?.estimatedCostUsd ?? 0)
  }), {}) : detail.summary.tokenUsage ?? {};
  const hasTokenUsage = Object.values(tokenUsage).some((value) => typeof value === "number" && value > 0);
  return {
    ...detail.summary,
    routeDecisionCount: detail.routeDecisions.length,
    subflowEntryCount: detail.subflows.length,
    actionAttemptCount: detail.actionAttempts?.length ?? detail.summary.actionAttemptCount,
    interventionCount: interventionSummaries.length,
    adaptationCount: new Set(detail.adaptationIds ?? []).size,
    durableBehaviorChanged: automationStudioRunChangedDurableBehavior(detail),
    ...(hasTokenUsage ? { tokenUsage } : {}),
    ...(interventionSummaries.length ? { interventionSummaries } : {})
  };
}

export function instructionSummaryFromInstruction(instruction: AutomationStudioFlowInstruction): AutomationStudioInstructionSummary {
  const scope = instruction.scope;
  return {
    instructionId: instruction.instructionId,
    summaryVersion: 2,
    ...(scope.kind !== "global" && "projectId" in scope ? { projectId: scope.projectId } : { projectId: "global" }),
    ...(scope.kind !== "global" && "flowId" in scope ? { flowId: scope.flowId } : {}),
    ...(scope.kind !== "global" && "subflowId" in scope && scope.subflowId ? { subflowId: scope.subflowId } : {}),
    title: instruction.title,
    scopeKind: scope.kind,
    status: instruction.status,
    requirement: instruction.requirement,
    priority: instruction.priority,
    updatedAt: instruction.updatedAt
  };
}

/**
 * `adaptations` are the Flow's known adaptations, which the classifier matches
 * a failure against. Without them every match set is empty, so a repair the
 * Flow already learned cannot be recognised on the next failure.
 */
export function runtimeSessionToFlowRunDetail(session: AutomationStudioRuntimeSession, projectId: string, adaptations?: AutomationStudioFlowAdaptation[]): AutomationStudioFlowRunDetail {
  const actionAttempts = runtimeActionAttemptsFromSession(session, adaptations);
  const recoveryAttempts = runtimeRecoveryAttemptsFromSession(session);
  const interventions = runtimeInterventionsFromRecoveryAttempts(session, recoveryAttempts);
  const terminalFailureReason = runtimeTerminalFailureReason(session, recoveryAttempts);
  // The run's lifecycle handler executions, which the root frame's trace carries (`executor/step-loop/lifecycle-trace.ts`).
  const handlerExecutions = session.trace?.handlerExecutions;
  return {
    schemaVersion: "0.1",
    summary: runtimeFlowRunSummaryFromSession(session, projectId),
    inputs: jsonObjectFromUnknown(session.metadata?.inputs) ?? {},
    routeDecisions: [],
    subflows: [],
    actionAttempts,
    recoveryAttempts,
    ...(handlerExecutions?.length ? { handlerExecutions: handlerExecutions.map((record) => ({ ...record, framePath: [...record.framePath] })) } : {}),
    // Retries, planned fails and true failures, from the run's recovery incidents and in-run repairs, for every run (`failure-counts.ts`).
    failureCounts: automationStudioRunFailureCounts(session.trace?.incidents, session.trace?.repairs),
    interventions,
    adaptationIds: [],
    changeProposalIds: [],
    metadata: {
      // The graph versions this run executed, carried off the session the run
      // itself stamped. A run detail that cannot name the version it ran cannot
      // be reasoned about at all, and this projection is the one path every
      // run's detail goes through -- routed or direct, succeeded or failed.
      ...automationStudioMetadataWithFlowVersions(undefined, automationStudioFlowVersionsFromMetadata(session.metadata)),
      compatibilitySource: "runtime-session",
      targetKind: session.targetKind,
      targetId: session.targetId,
      recoveryAttemptCount: recoveryAttempts.length,
      comparisonCount: actionAttempts.filter((attempt) => attempt.comparisonStatus).length,
      ...(terminalFailureReason ? { terminalFailureReason } : {}),
      ...(session.trace?.message ? { message: session.trace.message } : {}),
      ...(session.trace?.currentNodeId ? { currentNodeId: session.trace.currentNodeId } : {})
    }
  };
}

export function runtimeSummaryFromSession(session: AutomationStudioRuntimeSession): AutomationStudioRuntimeRunSummary {
  const updatedAt = session.finishedAt ?? session.startedAt ?? session.queuedAt ?? Date.now();
  return {
    runId: session.runId,
    targetKind: session.targetKind,
    targetId: session.targetId,
    status: session.status,
    queuedAt: session.queuedAt,
    ...(session.startedAt !== undefined ? { startedAt: session.startedAt } : {}),
    ...(session.finishedAt !== undefined ? { finishedAt: session.finishedAt } : {}),
    ...(session.flowId ? { flowId: session.flowId } : {}),
    attemptCount: session.trace?.attempts?.length ?? 0,
    effectCount: session.trace?.effects?.length ?? 0,
    updatedAt
  };
}

function graphStatusToFlowRunStatus(status: string): AutomationStudioFlowRunActionAttemptRecord["status"] {
  if (status === "running" || status === "succeeded" || status === "failed" || status === "waiting" || status === "cancelled") return status;
  return "unknown";
}

function runtimeActionAttemptsFromSession(session: AutomationStudioRuntimeSession, adaptations?: AutomationStudioFlowAdaptation[]): AutomationStudioFlowRunActionAttemptRecord[] {
  return (session.trace?.attempts ?? []).map((attempt, index) => {
    const durationMs = attempt.finishedAt === undefined ? undefined : Math.max(0, attempt.finishedAt - attempt.startedAt);
    // Session traces are read back from storage, so the record is parsed again.
    const failure = parseAutomationStudioFailureRecord(attempt.failure);
    const adaptiveFailure = attempt.status === "failed"
      ? compactAutomationStudioAdaptiveFailure(classifyAutomationStudioAdaptiveFailure({
        projectId: session.projectId ?? "",
        flowId: session.flowId,
        runId: session.runId,
        attempt,
        ...(adaptations?.length ? { adaptations } : {})
      }))
      : undefined;
    const recordCount = datasetMarkerRecordCount(attempt.outputs);
    const outputShape = attemptOutputShape(attempt.outputs);
    const hostTargetResolution = hostTargetResolutionFromOutputs(attempt.outputs);
    const extraction = extractionSummaryFromOutputs(attempt.outputs);
    const stateRouting = automationStudioRunDetailStateRouting(attempt, failure?.code);
    // The frames, failure class, frame entry and handler of state-aware recovery, as ids and closed codes (`recovery-trace.ts`).
    const recoveryTrace = automationStudioRunDetailRecoveryTrace(attempt);
    // A step whose state already held reads as done, with its failure kept (`flow-change/attempt-projection.ts`).
    const settled = automationStudioAttemptSettled(attempt);
    return {
      attemptId: attempt.attemptId,
      nodeId: attempt.nodeId,
      definitionId: attempt.definitionId,
      order: index + 1,
      status: graphStatusToFlowRunStatus(settled.status),
      ...(settled.route ? { route: settled.route } : {}),
      startedAt: attempt.startedAt,
      ...(attempt.finishedAt !== undefined ? { finishedAt: attempt.finishedAt } : {}),
      ...(durationMs !== undefined ? { durationMs } : {}),
      ...(attempt.transitionComparison?.status ? { comparisonStatus: attempt.transitionComparison.status } : {}),
      ...(attempt.message ? { message: attempt.message } : {}),
      ...(failure ? { failure } : {}),
      // A sometimes-present step the run passed over because its target was
      // observed absent (`executor/step-skip/absent-step.ts`). The attempt reads
      // `succeeded` down `route: "skipped"`, which alone a reader cannot tell
      // from a press; this says the step was skipped and what observed it. A
      // step state routing passed over (`executor/state-routing/`) also says
      // where the run went on to, so a run's detail shows the routing decision.
      ...(attempt.skipped ? { skipped: attempt.skipped.reason === "state_routed"
        ? { reason: "state_routed", code: attempt.skipped.code, toNodeId: attempt.skipped.toNodeId, direction: attempt.skipped.direction }
        : { reason: "target_absent", code: attempt.skipped.code } } : {}),
      // What state routing made of the page, whatever it decided: a step whose
      // routing found no way on otherwise reads like one that never consulted
      // it (`state-routing.ts`).
      ...(stateRouting ? { stateRouting } : {}),
      ...recoveryTrace,
      ...(attempt.stateHeld && attempt.status === "failed" ? { stateHeld: { rung: attempt.stateHeld.rung } } : {}),
      metadata: {
        ...(attempt.regionId ? { regionId: attempt.regionId } : {}),
        ...(attempt.transitionComparison?.diffSummary ? { diffSummary: attempt.transitionComparison.diffSummary } : {}),
        ...(attempt.recoveryDecision?.selected ? { recoverySelected: attempt.recoveryDecision.selected } : {}),
        ...(attempt.hostCapabilities?.length ? { hostCapabilities: attempt.hostCapabilities } : {}),
        ...(attempt.stateRefs ? { stateRefs: attempt.stateRefs } : {}),
        ...(attempt.targetResolution ? { targetResolution: attempt.targetResolution } : {}),
        // What the browser did once the command arrived, as against Core's
        // pre-dispatch choice above. The strategy is the only record that the
        // host re-resolved a control the recording named differently, which is
        // a recovery the ladder never sees because it happens before a failure
        // is reported.
        ...(hostTargetResolution ? { hostTargetResolution } : {}),
        // Which attempt of this node this is and which ladder rung asked for
        // it: a closed rung name and two integers. Without it a retried node
        // is indistinguishable from a Flow that authored the same node twice,
        // and no rung can be attributed to anything.
        ...(attempt.retry ? { retry: { attemptNumber: attempt.retry.attemptNumber, maxAttempts: attempt.retry.maxAttempts, backoffMs: attempt.retry.backoffMs, rung: attempt.retry.rung } } : {}),
        // What the run did about the state the node expected to find before it
        // ran. `message` is the host's sentence and stays behind.
        ...(attempt.readiness ? { readiness: { ceilingMs: attempt.readiness.ceilingMs, waitedMs: attempt.readiness.waitedMs, satisfied: attempt.readiness.satisfied, checkedConditionCount: attempt.readiness.checkedConditionCount } } : {}),
        ...(adaptiveFailure ? { adaptiveFailure } : {}),
        // The question this attempt put to a person, and how it came out: closed
        // words only, never the question or the answer. It is the only record
        // that a failed attempt did not end its node -- a person cleared what the
        // step met and the run went on down `route` (`executor/person-needed.ts`).
        ...(attempt.ask ? { ask: { kind: attempt.ask.kind, status: attempt.ask.status, ...(attempt.ask.route ? { route: attempt.ask.route } : {}), ...(attempt.ask.personNeeded ? { personNeeded: true } : {}) } } : {}),
        ...(recordCount !== undefined ? { recordCount } : {}),
        // What a list read said about its own read: counts, flags, the field
        // keys it declared, and whether the list it waited for was ever there.
        // `recordCount` above says how much was stored and cannot say why that
        // was the amount; this can. See `extractionSummaryFromOutputs`.
        ...(extraction ? { extraction } : {}),
        // What the step produced, as names and counts. See `attemptOutputShape`.
        ...(outputShape ? { outputShape } : {})
      }
    };
  });
}

// A saved trace holds a `$dataset` marker where an attempt's captured rows were
// (CD14), so the run record says how many rows the attempt captured without
// holding any of them. Session traces are read back from storage, so the
// marker's shape is checked rather than assumed.
/**
 * Which outputs a step produced, and how many rows each list held. Names and
 * counts; never a value.
 *
 * `attempt.outputs` is live data of unknown sensitivity and the run record has
 * always refused to copy it, which left the record able to say that a step
 * succeeded and unable to say whether it produced anything. `recordCount`
 * beside this answers only for a step that wrote a dataset marker. This answers
 * for every step, in the one shape that carries nothing off the page: an output
 * that is a list is its length, and any other output is `true`, meaning present.
 *
 * The keys are output port ids, which a domain mints, so they are screened
 * against that domain's declared keys where they are projected into a request
 * (`recovery/repair-context/step-parameters.ts`) rather than here, where no
 * declaration is in reach.
 */
function attemptOutputShape(outputs: unknown): JsonObject | undefined {
  if (!isJsonRecord(outputs)) return undefined;
  const entries = Object.entries(outputs).slice(0, 12)
    .map(([key, value]) => [key, Array.isArray(value) ? value.length : true] as const);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function datasetMarkerRecordCount(outputs: unknown): number | undefined {
  if (!isJsonRecord(outputs) || !isJsonRecord(outputs.records) || !isJsonRecord(outputs.records.$dataset)) return undefined;
  const recordCount = outputs.records.$dataset.recordCount;
  return typeof recordCount === "number" && Number.isFinite(recordCount) ? recordCount : undefined;
}

function runtimeFlowRunSummaryFromSession(session: AutomationStudioRuntimeSession, projectId: string): AutomationStudioFlowRunSummary {
  const recoveryAttemptCount = session.trace?.attempts?.filter((attempt) => attempt.recoveryDecision).length ?? 0;
  const interventionCount = session.trace?.attempts?.filter((attempt) => attempt.recoveryDecision?.selected?.kind === "llm_diagnosis").length ?? 0;
  return {
    schemaVersion: "0.1",
    runId: session.runId,
    flowId: session.flowId,
    projectId,
    status: session.status,
    startedAt: session.startedAt ?? session.queuedAt,
    ...(session.finishedAt !== undefined ? { finishedAt: session.finishedAt } : {}),
    updatedAt: Math.max(session.finishedAt ?? 0, session.startedAt ?? 0, session.queuedAt),
    routeDecisionCount: 0,
    subflowEntryCount: 0,
    actionAttemptCount: session.trace?.attempts?.length ?? 0,
    interventionCount,
    adaptationCount: 0,
    failureCounts: automationStudioRunFailureCounts(session.trace?.incidents, session.trace?.repairs),
    metadata: {
      compatibilitySource: "runtime-session",
      targetKind: session.targetKind,
      targetId: session.targetId,
      effectCount: session.trace?.effects?.length ?? 0,
      recoveryAttemptCount
    }
  };
}

/**
 * Core's code for the ladder selecting its model rung: a record, not a verdict.
 *
 * Every other issue Core writes onto an intervention begins with a code, and a
 * reader -- the web UI, the Lab's run-detail parser -- takes the code and drops
 * the sentence. This one was a bare sentence, so it reduced to *nothing*: the
 * Lab's evaluation of run `run-muesyox4-930bef98` (2026-09-23) recorded
 * `{ validationOk: false, validationCodes: [] }`. It then gained a code,
 * `recovery.ladder_diagnosis_unanswered`, but kept `ok: false`, and that still
 * read as a failed diagnosis call at the start of every step-failure run (t193
 * wK, K7: thirteen runs). Nothing was called and nothing failed: the executor
 * records that its deterministic rungs ran out and the model rung was selected,
 * and the run's recovery stage is what answers it. So the record is
 * informational -- `ok: true` -- and its code says what happened.
 */
export const AUTOMATION_STUDIO_LADDER_MODEL_RUNG_SELECTED_CODE = "recovery.ladder_model_rung_selected";

function runtimeInterventionsFromRecoveryAttempts(session: AutomationStudioRuntimeSession, recoveryAttempts: AutomationStudioFlowRunRecoveryRecord[]): AutomationStudioFlowIntervention[] {
  return recoveryAttempts
    .filter((attempt) => attempt.status === "diagnosis_only")
    .map((attempt) => ({
      schemaVersion: "0.1",
      interventionId: `${attempt.recoveryId}.diagnosis`,
      runId: session.runId,
      flowId: session.flowId,
      projectId: session.projectId ?? "",
      kind: "diagnosis",
      reason: attempt.reason ?? "Recovery ladder reached LLM diagnosis fallback.",
      contextSummary: {
        attemptId: attempt.attemptId,
        nodeId: attempt.nodeId,
        candidateCount: attempt.candidateCount
      },
      validation: { ok: true, issues: [`${AUTOMATION_STUDIO_LADDER_MODEL_RUNG_SELECTED_CODE}: The recovery ladder exhausted its deterministic rungs and selected its model rung. The executor records the selection and calls no provider; the run's recovery stage is what answers it.`] },
      createdAt: attempt.createdAt,
      metadata: { recoveryId: attempt.recoveryId }
    }));
}

function runtimeRecoveryAttemptsFromSession(session: AutomationStudioRuntimeSession): AutomationStudioFlowRunRecoveryRecord[] {
  const createdAt = session.finishedAt ?? session.startedAt ?? session.queuedAt;
  return (session.trace?.attempts ?? [])
    .filter((attempt) => attempt.recoveryDecision)
    .map((attempt) => {
      const decision = attempt.recoveryDecision!;
      const selected = decision.selected;
      return {
        recoveryId: `${attempt.attemptId}.recovery`,
        attemptId: attempt.attemptId,
        nodeId: attempt.nodeId,
        ...(selected?.kind ? { selectedKind: selected.kind } : {}),
        ...(selected?.targetNodeId ? { selectedTargetNodeId: selected.targetNodeId } : {}),
        ...(selected?.edgeId ? { selectedEdgeId: selected.edgeId } : {}),
        candidateCount: decision.candidates.length,
        ...(selected?.reason ? { reason: selected.reason } : {}),
        status: selected?.kind === "llm_diagnosis" ? "diagnosis_only" : selected ? "selected" : "exhausted",
        createdAt,
        metadata: {
          lookup: decision.lookup,
          candidates: decision.candidates
        }
      };
    });
}

function runtimeTerminalFailureReason(session: AutomationStudioRuntimeSession, recoveryAttempts: AutomationStudioFlowRunRecoveryRecord[]): string | undefined {
  if (session.status !== "failed") return undefined;
  const latest = recoveryAttempts[recoveryAttempts.length - 1];
  if (!latest) return session.trace?.message ?? "Run failed before recovery lookup produced a candidate.";
  if (latest.status === "diagnosis_only") return "Recovery ladder stopped at LLM diagnosis fallback because no deterministic recovery resolved the failure.";
  if (latest.status === "exhausted") return "Recovery ladder exhausted all known recovery candidates.";
  return session.trace?.message ?? "Run failed after recovery was selected.";
}

export function bootstrapAdaptationSummary(adaptation: AutomationStudioBootstrapAdaptation): AutomationStudioAdaptationSummary {
  return {
    adaptationId: adaptation.adaptationId,
    flowId: adaptation.flowId,
    projectId: adaptation.projectId,
    status: adaptation.status,
    riskLevel: adaptation.riskLevel,
    trigger: "Instruction-built Flow Bootstrap",
    updatedAt: adaptation.updatedAt
  };
}
