import { createHash } from "node:crypto";
import { parseAutomationStudioFailureRecord, type AutomationStudioAdaptiveFailureClass, type AutomationStudioFailureRecord } from "@fluxiq/contracts/automation-studio";
import type { JsonObject } from "../../../core/index.ts";
import type { AutomationStudioFlowAdaptation, AutomationStudioFlowRunRecoveryRecord, AutomationStudioRouteDecisionRecord } from "../model/index.ts";
import type { AutomationStudioNodeAttemptTrace, AutomationStudioRecoveryCandidate, AutomationStudioTransitionComparisonStatus } from "./executor.ts";

// Core's failure names and structured failure record live in @fluxiq/contracts
// so browser clients use the same list. They are re-exported beside the
// classifier that consumes them so runtime importers keep one import path.
export {
  AUTOMATION_STUDIO_ADAPTIVE_FAILURE_CLASSES,
  AUTOMATION_STUDIO_FAILURE_RECORD_LIMITS,
  AUTOMATION_STUDIO_FAILURE_STAGES,
  isAutomationStudioAdaptiveFailureClass,
  parseAutomationStudioFailureRecord
} from "@fluxiq/contracts/automation-studio";
export type { AutomationStudioAdaptiveFailureClass, AutomationStudioFailureRecord, AutomationStudioFailureStage } from "@fluxiq/contracts/automation-studio";

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
  /**
   * Every recorded adaptation that matches this failure, whatever its status.
   * `known` marks the ones that answer it (see `KNOWN_ADAPTATION_STATUSES`);
   * the rest are listed because a repair that matched and did not hold is
   * itself evidence. `matchedBy` says whether the record's own failure
   * signature matched, or, for a record written without one, its node.
   */
  knownAdaptationMatches: Array<{
    adaptationId: string;
    status: AutomationStudioFlowAdaptation["status"];
    riskLevel: AutomationStudioFlowAdaptation["riskLevel"];
    matchedBy: "failure_signature" | "node_identity";
    known: boolean;
  }>;
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
  const signature = adaptiveFailureSignature(adaptiveFailureSignatureInput({
    flowId: input.flowId,
    subflowId: input.subflowId,
    nodeId: input.attempt.nodeId,
    definitionId: input.attempt.definitionId,
    comparisonStatus,
    failureClass
  }));
  const knownAdaptationMatches = knownAdaptationMatchesForFailure(input, signature);
  const knownRecoveryAvailable = deterministicRecoveryCandidates.length > 0;
  const knownAdaptationAvailable = knownAdaptationMatches.some((adaptation) => adaptation.known);
  const appliedAdaptationRecurred = knownAdaptationMatches.some((adaptation) => adaptation.status === "applied");
  const llmEligibility = llmEligibilityForFailure({ failureClass, knownRecoveryAvailable, knownAdaptationAvailable, appliedAdaptationRecurred });
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
  // Structured first: a valid failure record names its category outright, and
  // the target comparison statuses exist only where a record produced them.
  const structured = parseAutomationStudioFailureRecord(attempt.failure);
  if (structured) return structured.category;
  if (comparisonStatus === "target_not_found" || comparisonStatus === "target_ambiguous") return comparisonStatus;
  // Legacy fallback for attempts recorded before the failure record existed.
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
  // A verdict on the run's *result* is not a step that went wrong. Every step
  // did what it said, and what the run produced does not answer the request --
  // the most common way a Flow built from an instruction fails, and the one the
  // repair ladder could not see (`fa-r5-postmortem.md`, cause 2). No wait and
  // no different target repairs it: the Flow is missing a step, or taking the
  // wrong path to the one it has, so the shape of repair available is a change
  // to the path -- an inserted action sequence, a reroute, a recovery subflow.
  // Without this the verdict arrives as `output_not_observed` and is planned as
  // a wait-and-retry, which is the one repair that cannot change what a clean
  // run produces.
  //
  // `ambiguous_or_unknown` from the same place is verification's other verdict
  // -- a result nobody could judge -- and it stays `diagnosis_only`, because
  // changing a Flow on the strength of "we could not tell" is a guess.
  //
  // The stage alone would be wrong, and reading it alone was the first draft of
  // this. `verification` is also where a domain reports a step whose effect it
  // could not confirm -- the web domain's `web.validation.output_not_observed`
  // and `web.assert.text` are recorded at that stage -- and those are exactly
  // the failures a wait does repair. The code is what tells them apart: only
  // Core writes the `core.result.` namespace, and only for a judgement on a
  // finished run's result.
  if (isAutomationStudioRunResultFailure(parseAutomationStudioFailureRecord(input.attempt.failure))) {
    return failureClass === "ambiguous_or_unknown" ? "diagnosis_only" : "recovery_path_or_reroute";
  }
  switch (failureClass) {
    case "expected_state_missing":
    case "timeout":
    case "output_not_observed":
      return "expectation_wait_retry";
    case "target_not_found":
    case "target_ambiguous":
      return "action_target_override";
    case "navigation_unexpected":
    case "page_changed":
      return "recovery_path_or_reroute";
    case "unexpected_state":
    case "action_failed":
      return input.subflowId ? "action_target_override" : "recovery_path_or_reroute";
    case "missing_router_or_subflow_target":
      return "router_rule_edit";
    case "graph_validation_or_unknown_node":
      return "subflow_edit_or_create";
    case "blocked_by_capability_or_policy":
    case "external_side_effect_denied":
    case "auth_required":
    case "user_intervention_required":
    case "ambiguous_or_unknown":
      return "diagnosis_only";
    default:
      return candidateKindForUnhandledClass(failureClass);
  }
}

/**
 * Core's namespace for a verdict on a finished run's result
 * (`result-verification/`). A domain owns its own codes and never writes one in
 * this namespace, which is what makes the prefix a safe discriminator.
 */
const AUTOMATION_STUDIO_RUN_RESULT_FAILURE_CODE_PREFIX = "core.result.";

/** Whether this failure is a judgement on what the run produced, rather than on a step it ran. */
function isAutomationStudioRunResultFailure(failure: AutomationStudioFailureRecord | null): boolean {
  return failure?.stage === "verification" && failure.code.startsWith(AUTOMATION_STUDIO_RUN_RESULT_FAILURE_CODE_PREFIX);
}

// Compile-time exhaustiveness: a new failure class fails the type check here
// until it is given a candidate kind.
function candidateKindForUnhandledClass(_failureClass: never): AutomationStudioAdaptiveCandidateKind {
  return "diagnosis_only";
}

function deterministicRecoveryCandidatesForAttempt(attempt: AutomationStudioNodeAttemptTrace): AutomationStudioRecoveryCandidate[] {
  return (attempt.recoveryDecision?.candidates ?? []).filter((candidate) => candidate.kind !== "llm_diagnosis");
}

/**
 * The adaptation statuses that are a known answer to a failure they match.
 *
 * Only `validated`: a change that was verified or approved and is not yet part
 * of the Flow, so applying it is the next move and asking a model would put a
 * guess in place of a known answer. `applied` is left out on purpose. An applied
 * change is already in the Flow, so the failure it matches happening again is
 * the evidence that it did not hold, and only a fresh diagnosis can answer that.
 * Treating it as known left a repaired node that drifted again with nothing that
 * could ever repair it (D-2). Every other status is a change nobody has shown to
 * work.
 */
const KNOWN_ADAPTATION_STATUSES: ReadonlySet<AutomationStudioFlowAdaptation["status"]> = new Set(["validated"]);

function knownAdaptationMatchesForFailure(input: AutomationStudioAdaptiveFailureInput, signature: string): AutomationStudioAdaptiveFailure["knownAdaptationMatches"] {
  return (input.adaptations ?? []).flatMap((adaptation) => {
    const matchedBy = adaptationMatchBasis(adaptation, input, signature);
    return matchedBy
      ? [{ adaptationId: adaptation.adaptationId, status: adaptation.status, riskLevel: adaptation.riskLevel, matchedBy, known: KNOWN_ADAPTATION_STATUSES.has(adaptation.status) }]
      : [];
  });
}

/**
 * How a recorded adaptation matches this failure, or `undefined` when it does not.
 *
 * A record that names the failure it was written for is matched by that name and
 * nothing else. The signature carries the failure class, so the same node failing
 * for a different reason is a different failure, and a repair for the first says
 * nothing about the second. It never falls back to its node.
 *
 * A record written before signatures existed is matched by the node it repaired,
 * and only by that: the same node and definition, in the same Subflow when both
 * name one. The earlier free-text match on the trigger is gone, because it
 * matched any node in a Subflow whose trigger happened to name the class.
 */
function adaptationMatchBasis(
  adaptation: AutomationStudioFlowAdaptation,
  input: AutomationStudioAdaptiveFailureInput,
  signature: string
): AutomationStudioAdaptiveFailure["knownAdaptationMatches"][number]["matchedBy"] | undefined {
  const recorded = adaptation.metadata?.failureSignature;
  if (typeof recorded === "string" && recorded.length > 0) return recorded === signature ? "failure_signature" : undefined;
  if (adaptation.subflowId && input.subflowId && adaptation.subflowId !== input.subflowId) return undefined;
  const failedAction = adaptation.failedAction as JsonObject | undefined;
  return failedAction?.nodeId === input.attempt.nodeId && failedAction?.definitionId === input.attempt.definitionId ? "node_identity" : undefined;
}

function llmEligibilityForFailure(input: {
  failureClass: AutomationStudioAdaptiveFailureClass;
  knownRecoveryAvailable: boolean;
  knownAdaptationAvailable: boolean;
  appliedAdaptationRecurred: boolean;
}): AutomationStudioAdaptiveFailure["llmEligibility"] {
  const { failureClass, knownRecoveryAvailable, knownAdaptationAvailable } = input;
  if (knownRecoveryAvailable) return { eligible: false, reason: "A deterministic recovery candidate is available and should run before LLM intervention.", knownRecoveryAvailable, knownAdaptationAvailable };
  if (knownAdaptationAvailable) return { eligible: false, reason: "A validated adaptation matches this failure and is not yet applied.", knownRecoveryAvailable, knownAdaptationAvailable };
  if (failureClass === "blocked_by_capability_or_policy" || failureClass === "external_side_effect_denied") return { eligible: false, reason: "Policy, authorization, or side-effect gates blocked execution.", knownRecoveryAvailable, knownAdaptationAvailable };
  if (failureClass === "auth_required" || failureClass === "user_intervention_required") return { eligible: false, reason: "A person must authenticate or intervene before the run can continue.", knownRecoveryAvailable, knownAdaptationAvailable };
  if (failureClass === "graph_validation_or_unknown_node") return { eligible: false, reason: "Graph validation or missing implementation must be fixed structurally before LLM runtime repair.", knownRecoveryAvailable, knownAdaptationAvailable };
  if (input.appliedAdaptationRecurred) return { eligible: true, reason: "An applied adaptation matches this failure and it happened again with that change in place, so the failure is unresolved.", knownRecoveryAvailable, knownAdaptationAvailable };
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
