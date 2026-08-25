import { createHash } from "node:crypto";
import type { JsonObject } from "../../../core/index.ts";
import type { AutomationStudioFlowAdaptation, AutomationStudioFlowRunRecoveryRecord, AutomationStudioRouteDecisionRecord } from "../model/index.ts";
import type { AutomationStudioNodeAttemptTrace, AutomationStudioRecoveryCandidate, AutomationStudioTransitionComparisonStatus } from "./executor.ts";

export type AutomationStudioAdaptiveFailureClass =
  | "action_failed"
  | "expected_state_missing"
  | "unexpected_state"
  | "timeout"
  | "blocked_by_capability_or_policy"
  | "missing_router_or_subflow_target"
  | "graph_validation_or_unknown_node"
  | "external_side_effect_denied"
  | "ambiguous_or_unknown";

export type AutomationStudioAdaptiveCandidateKind =
  | "expectation_wait_retry"
  | "action_target_override"
  | "recovery_path_or_reroute"
  | "router_rule_edit"
  | "subflow_edit_or_create"
  | "instruction_suggestion"
  | "diagnosis_only";

export type AutomationStudioAdaptiveFailure = {
  failureId: string;
  signature: string;
  projectId: string;
  flowId: string;
  runId: string;
  subflowId?: string;
  nodeId: string;
  definitionId: string;
  attemptId: string;
  comparisonStatus?: AutomationStudioTransitionComparisonStatus;
  failureClass: AutomationStudioAdaptiveFailureClass;
  candidateKind: AutomationStudioAdaptiveCandidateKind;
  routeDecisionId?: string;
  deterministicRecoveryCandidates: AutomationStudioRecoveryCandidate[];
  knownAdaptationMatches: Array<{ adaptationId: string; status: AutomationStudioFlowAdaptation["status"]; riskLevel: AutomationStudioFlowAdaptation["riskLevel"] }>;
  llmEligibility: {
    eligible: boolean;
    reason: string;
    knownRecoveryAvailable: boolean;
    knownAdaptationAvailable: boolean;
  };
  message?: string;
  metadata?: JsonObject;
};

export type AutomationStudioAdaptiveFailureInput = {
  projectId: string;
  flowId: string;
  runId: string;
  subflowId?: string;
  attempt: AutomationStudioNodeAttemptTrace;
  routeDecision?: AutomationStudioRouteDecisionRecord;
  recoveryAttempts?: AutomationStudioFlowRunRecoveryRecord[];
  adaptations?: AutomationStudioFlowAdaptation[];
};

export function classifyAutomationStudioAdaptiveFailure(input: AutomationStudioAdaptiveFailureInput): AutomationStudioAdaptiveFailure {
  const comparisonStatus = input.attempt.transitionComparison?.status;
  const failureClass = adaptiveFailureClassForAttempt(input.attempt, comparisonStatus);
  const candidateKind = adaptiveCandidateKindForFailure(failureClass, input);
  const deterministicRecoveryCandidates = deterministicRecoveryCandidatesForAttempt(input.attempt);
  const knownAdaptationMatches = knownAdaptationMatchesForFailure(input, failureClass);
  const knownRecoveryAvailable = deterministicRecoveryCandidates.length > 0;
  const knownAdaptationAvailable = knownAdaptationMatches.some((adaptation) => adaptation.status === "applied" || adaptation.status === "validated");
  const llmEligibility = llmEligibilityForFailure(failureClass, knownRecoveryAvailable, knownAdaptationAvailable);
  const signature = adaptiveFailureSignature(adaptiveFailureSignatureInput({
    flowId: input.flowId,
    subflowId: input.subflowId,
    nodeId: input.attempt.nodeId,
    definitionId: input.attempt.definitionId,
    comparisonStatus,
    failureClass
  }));
  return {
    failureId: `adaptive-failure.${input.runId}.${input.attempt.attemptId}`,
    signature,
    projectId: input.projectId,
    flowId: input.flowId,
    runId: input.runId,
    ...(input.subflowId ? { subflowId: input.subflowId } : {}),
    nodeId: input.attempt.nodeId,
    definitionId: input.attempt.definitionId,
    attemptId: input.attempt.attemptId,
    ...(comparisonStatus ? { comparisonStatus } : {}),
    failureClass,
    candidateKind,
    ...(input.routeDecision?.decisionId ? { routeDecisionId: input.routeDecision.decisionId } : {}),
    deterministicRecoveryCandidates,
    knownAdaptationMatches,
    llmEligibility,
    ...(input.attempt.message ? { message: input.attempt.message } : {})
  };
}

export function compactAutomationStudioAdaptiveFailure(failure: AutomationStudioAdaptiveFailure): JsonObject {
  return {
    failureId: failure.failureId,
    signature: failure.signature,
    failureClass: failure.failureClass,
    candidateKind: failure.candidateKind,
    nodeId: failure.nodeId,
    definitionId: failure.definitionId,
    attemptId: failure.attemptId,
    ...(failure.subflowId ? { subflowId: failure.subflowId } : {}),
    ...(failure.comparisonStatus ? { comparisonStatus: failure.comparisonStatus } : {}),
    deterministicRecoveryCandidateCount: failure.deterministicRecoveryCandidates.length,
    knownAdaptationIds: failure.knownAdaptationMatches.map((adaptation) => adaptation.adaptationId),
    llmEligibility: failure.llmEligibility,
    ...(failure.message ? { message: failure.message } : {})
  };
}

function adaptiveFailureClassForAttempt(attempt: AutomationStudioNodeAttemptTrace, comparisonStatus: AutomationStudioTransitionComparisonStatus | undefined): AutomationStudioAdaptiveFailureClass {
  const message = attempt.message ?? "";
  if (/external side|side-effect|side effect/i.test(message)) return "external_side_effect_denied";
  if (/requires runtime capability|capability|policy|authorization|denied/i.test(message)) return "blocked_by_capability_or_policy";
  if (/missing subflow|missing route|router|fallback/i.test(message)) return "missing_router_or_subflow_target";
  if (/unknown|validation|definition|node implementation/i.test(message)) return "graph_validation_or_unknown_node";
  if (comparisonStatus === "missing_expected_state") return "expected_state_missing";
  if (comparisonStatus === "unexpected_state") return "unexpected_state";
  if (comparisonStatus === "timeout" || /timeout|timed out/i.test(message)) return "timeout";
  if (comparisonStatus === "action_failed" || attempt.status === "failed") return "action_failed";
  if (comparisonStatus === "blocked") return "blocked_by_capability_or_policy";
  return "ambiguous_or_unknown";
}

function adaptiveCandidateKindForFailure(failureClass: AutomationStudioAdaptiveFailureClass, input: AutomationStudioAdaptiveFailureInput): AutomationStudioAdaptiveCandidateKind {
  if (failureClass === "expected_state_missing" || failureClass === "timeout") return "expectation_wait_retry";
  if (failureClass === "unexpected_state" || failureClass === "action_failed") return input.subflowId ? "action_target_override" : "recovery_path_or_reroute";
  if (failureClass === "missing_router_or_subflow_target") return "router_rule_edit";
  if (failureClass === "blocked_by_capability_or_policy" || failureClass === "external_side_effect_denied") return "diagnosis_only";
  if (failureClass === "graph_validation_or_unknown_node") return "subflow_edit_or_create";
  return "diagnosis_only";
}

function deterministicRecoveryCandidatesForAttempt(attempt: AutomationStudioNodeAttemptTrace): AutomationStudioRecoveryCandidate[] {
  return (attempt.recoveryDecision?.candidates ?? []).filter((candidate) => candidate.kind !== "llm_diagnosis");
}

function knownAdaptationMatchesForFailure(input: AutomationStudioAdaptiveFailureInput, failureClass: AutomationStudioAdaptiveFailureClass): AutomationStudioAdaptiveFailure["knownAdaptationMatches"] {
  return (input.adaptations ?? [])
    .filter((adaptation) => adaptationMatchesFailure(adaptation, input, failureClass))
    .map((adaptation) => ({ adaptationId: adaptation.adaptationId, status: adaptation.status, riskLevel: adaptation.riskLevel }));
}

function adaptationMatchesFailure(adaptation: AutomationStudioFlowAdaptation, input: AutomationStudioAdaptiveFailureInput, failureClass: AutomationStudioAdaptiveFailureClass): boolean {
  const failedAction = adaptation.failedAction as JsonObject | undefined;
  if (failedAction?.nodeId === input.attempt.nodeId && failedAction?.definitionId === input.attempt.definitionId) return true;
  if (adaptation.subflowId && input.subflowId && adaptation.subflowId === input.subflowId && adaptation.trigger.toLowerCase().includes(failureClass.replace(/_/g, " "))) return true;
  return adaptation.metadata?.failureSignature === adaptiveFailureSignature(adaptiveFailureSignatureInput({
    flowId: input.flowId,
    subflowId: input.subflowId,
    nodeId: input.attempt.nodeId,
    definitionId: input.attempt.definitionId,
    comparisonStatus: input.attempt.transitionComparison?.status,
    failureClass
  }));
}

function llmEligibilityForFailure(
  failureClass: AutomationStudioAdaptiveFailureClass,
  knownRecoveryAvailable: boolean,
  knownAdaptationAvailable: boolean
): AutomationStudioAdaptiveFailure["llmEligibility"] {
  if (knownRecoveryAvailable) return { eligible: false, reason: "A deterministic recovery candidate is available and should run before LLM intervention.", knownRecoveryAvailable, knownAdaptationAvailable };
  if (knownAdaptationAvailable) return { eligible: false, reason: "A known validated/applied adaptation matches this failure.", knownRecoveryAvailable, knownAdaptationAvailable };
  if (failureClass === "blocked_by_capability_or_policy" || failureClass === "external_side_effect_denied") return { eligible: false, reason: "Policy, authorization, or side-effect gates blocked execution.", knownRecoveryAvailable, knownAdaptationAvailable };
  if (failureClass === "graph_validation_or_unknown_node") return { eligible: false, reason: "Graph validation or missing implementation must be fixed structurally before LLM runtime repair.", knownRecoveryAvailable, knownAdaptationAvailable };
  return { eligible: true, reason: "Failure is unresolved after deterministic recovery lookup.", knownRecoveryAvailable, knownAdaptationAvailable };
}

function adaptiveFailureSignature(input: {
  flowId: string;
  subflowId?: string;
  nodeId: string;
  definitionId: string;
  comparisonStatus?: string;
  failureClass: AutomationStudioAdaptiveFailureClass;
}): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 24);
}

function adaptiveFailureSignatureInput(input: {
  flowId: string;
  subflowId?: string | undefined;
  nodeId: string;
  definitionId: string;
  comparisonStatus?: string | undefined;
  failureClass: AutomationStudioAdaptiveFailureClass;
}): {
  flowId: string;
  subflowId?: string;
  nodeId: string;
  definitionId: string;
  comparisonStatus?: string;
  failureClass: AutomationStudioAdaptiveFailureClass;
} {
  return {
    flowId: input.flowId,
    ...(input.subflowId ? { subflowId: input.subflowId } : {}),
    nodeId: input.nodeId,
    definitionId: input.definitionId,
    ...(input.comparisonStatus ? { comparisonStatus: input.comparisonStatus } : {}),
    failureClass: input.failureClass
  };
}
