// Stage A of the loop's failure entry point: what is wrong, decided without
// asking a model anything.
//
// The classifier this reads has existed and been correct for some time. What it
// did not have was a caller that acted on it: `llmEligibility` decorated a run
// summary, and the provider was called regardless. Decision L5 says the order
// is the other way round -- deterministic first, and the model is not asked at
// all when something cheaper and more reliable already answers.
//
// That ordering is not a cost optimization, or not only one. A run whose
// failure already has a deterministic recovery, or a validated adaptation that
// matched it before, has a *known* answer; asking a model at that point
// substitutes a guess for it. And a failure that needs a person -- a sign-in, a
// dialog, a policy refusal, a graph that does not validate -- is not made
// answerable by asking more cleverly. In both cases the honest result is the
// deterministic one, and this module is where it is produced.
//
// The resolution below is computed from the same three inputs the classifier's
// own `llmEligibility` uses, in the same order, and a test walks every failure
// class asserting the two still agree. That is deliberate: the classifier
// carries the authority, this module carries the vocabulary the rest of the
// loop needs, and neither may drift away from the other silently.

import type { AutomationStudioFlowAdaptation } from "../../model/index.ts";
import {
  classifyAutomationStudioAdaptiveFailure,
  type AutomationStudioAdaptiveCandidateKind,
  type AutomationStudioAdaptiveFailureClass
} from "../adaptive-orchestrator.ts";
import type { AutomationStudioNodeAttemptTrace } from "../executor.ts";

/**
 * What answers this failure, decided before any provider exists.
 *
 * Four outcomes, and only the last one reaches a model. The first two name work
 * that is already known and must run first; the third names a failure the loop
 * cannot resolve at all, whoever is asked.
 */
export type AutomationStudioRuntimeDiagnosisResolution =
  | "deterministic_recovery"
  | "known_adaptation"
  | "manual_intervention"
  | "model_required";

/** What must happen before the model may be asked, when something must. */
export type AutomationStudioRuntimeDiagnosisPriorAction =
  | "none"
  | "known_recovery"
  | "reroute"
  | "known_adaptation"
  | "manual_intervention";

/**
 * Whether the run's goal is still reachable at all.
 *
 * Three values rather than a boolean, because "we do not know" is the common
 * case and is not the same claim as "no". `no` is reserved for the two classes
 * where Core knows a person must act first; everything else is `unknown` until
 * something observes otherwise. Nothing here ever returns `yes` from the
 * absence of a contradiction.
 */
export type AutomationStudioRuntimeDiagnosisAchievability = "yes" | "no" | "unknown";

export type AutomationStudioRuntimeDeterministicDiagnosis = {
  schemaVersion: "automation-studio.deterministic-diagnosis.v1";
  failureClass: AutomationStudioAdaptiveFailureClass;
  candidateKind: AutomationStudioAdaptiveCandidateKind;
  /** The classifier's stable signature for this failure, for matching it later. */
  signature: string;
  resolution: AutomationStudioRuntimeDiagnosisResolution;
  /** True only for `model_required`. The one field the gate reads. */
  modelNeeded: boolean;
  reason: string;
  requiredPriorAction: AutomationStudioRuntimeDiagnosisPriorAction;
  stillAchievable: AutomationStudioRuntimeDiagnosisAchievability;
  deterministicRecoveryAvailable: boolean;
  rerouteAvailable: boolean;
  knownAdaptationAvailable: boolean;
  /** Identity only. A patch is never carried here; see `context.ts`. */
  knownAdaptationIds: string[];
};

export type AutomationStudioRuntimeDeterministicDiagnosisInput = {
  projectId: string;
  flowId: string;
  runId: string;
  subflowId?: string;
  /** The attempt as the run executed it; without one there is nothing to classify. */
  failedAttempt: AutomationStudioNodeAttemptTrace;
  adaptations?: AutomationStudioFlowAdaptation[];
};

/**
 * The failure classes no amount of asking resolves, because the next move
 * belongs to a person or to an edit of the Flow itself.
 *
 * Policy and side-effect refusals are a decision somebody made on purpose;
 * authentication and intervention need a human at the keyboard; a graph that
 * does not validate needs the graph changed, not the run repaired. Asking a
 * model to work around any of them is asking it to defeat a control.
 */
const AUTOMATION_STUDIO_MANUAL_INTERVENTION_FAILURE_CLASSES: ReadonlySet<AutomationStudioAdaptiveFailureClass> = new Set([
  "blocked_by_capability_or_policy",
  "external_side_effect_denied",
  "auth_required",
  "user_intervention_required",
  "graph_validation_or_unknown_node"
]);

/**
 * What answers this failure, from the three things the classifier knows. Split
 * out so the gate, the plan and the drift test read one rule rather than three
 * copies of it.
 */
export function automationStudioRuntimeDiagnosisResolution(input: {
  failureClass: AutomationStudioAdaptiveFailureClass;
  deterministicRecoveryAvailable: boolean;
  knownAdaptationAvailable: boolean;
}): AutomationStudioRuntimeDiagnosisResolution {
  if (input.deterministicRecoveryAvailable) return "deterministic_recovery";
  if (input.knownAdaptationAvailable) return "known_adaptation";
  if (AUTOMATION_STUDIO_MANUAL_INTERVENTION_FAILURE_CLASSES.has(input.failureClass)) return "manual_intervention";
  return "model_required";
}

/** Stage A: the whole deterministic diagnosis, with no provider in reach. */
export function buildAutomationStudioRuntimeDeterministicDiagnosis(
  input: AutomationStudioRuntimeDeterministicDiagnosisInput
): AutomationStudioRuntimeDeterministicDiagnosis {
  const failure = classifyAutomationStudioAdaptiveFailure({
    projectId: input.projectId,
    flowId: input.flowId,
    runId: input.runId,
    ...(input.subflowId ? { subflowId: input.subflowId } : {}),
    attempt: input.failedAttempt,
    ...(input.adaptations?.length ? { adaptations: input.adaptations } : {})
  });
  const deterministicRecoveryAvailable = failure.llmEligibility.knownRecoveryAvailable;
  const knownAdaptationAvailable = failure.llmEligibility.knownAdaptationAvailable;
  const resolution = automationStudioRuntimeDiagnosisResolution({
    failureClass: failure.failureClass,
    deterministicRecoveryAvailable,
    knownAdaptationAvailable
  });
  const rerouteAvailable = failure.deterministicRecoveryCandidates.some((candidate) => candidate.kind === "reroute");
  return {
    schemaVersion: "automation-studio.deterministic-diagnosis.v1",
    failureClass: failure.failureClass,
    candidateKind: failure.candidateKind,
    signature: failure.signature,
    resolution,
    modelNeeded: resolution === "model_required",
    reason: failure.llmEligibility.reason,
    requiredPriorAction: priorActionForResolution(resolution, rerouteAvailable),
    stillAchievable: achievabilityForFailure(failure.failureClass, resolution),
    deterministicRecoveryAvailable,
    rerouteAvailable,
    knownAdaptationAvailable,
    knownAdaptationIds: failure.knownAdaptationMatches.map((match) => match.adaptationId)
  };
}

function priorActionForResolution(
  resolution: AutomationStudioRuntimeDiagnosisResolution,
  rerouteAvailable: boolean
): AutomationStudioRuntimeDiagnosisPriorAction {
  if (resolution === "deterministic_recovery") return rerouteAvailable ? "reroute" : "known_recovery";
  if (resolution === "known_adaptation") return "known_adaptation";
  if (resolution === "manual_intervention") return "manual_intervention";
  return "none";
}

/**
 * `no` only where Core knows a person must act. A deterministic recovery or a
 * matched adaptation is evidence that something can still be done, so those are
 * `yes`; everything else is `unknown`, which is what "the model has not been
 * asked yet" actually means.
 */
function achievabilityForFailure(
  failureClass: AutomationStudioAdaptiveFailureClass,
  resolution: AutomationStudioRuntimeDiagnosisResolution
): AutomationStudioRuntimeDiagnosisAchievability {
  if (failureClass === "auth_required" || failureClass === "user_intervention_required") return "no";
  if (resolution === "deterministic_recovery" || resolution === "known_adaptation") return "yes";
  return "unknown";
}
