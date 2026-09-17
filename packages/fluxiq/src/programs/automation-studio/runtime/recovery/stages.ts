// The failure entry point's four stages, assembled from one run's outcome.
//
// `trace.ts` owns the vocabulary and the ordering rule. This owns the
// reading: given what the gate decided, what the plan asked for and what the
// run ended up producing, which four events describe it. One place, so a run
// annotated from the deterministic early return and a run annotated after a
// full patch attempt cannot describe themselves in two different ways.
//
// Three of the four stages carry a Core loop stage, and which three is a
// statement rather than an omission. `diagnosis` drives `gather`,
// `recovery_plan` drives `plan`, and `exploration` drives `gather` again but
// only when an exploration actually ran; `resolution` drives `implement` only
// when a patch call was actually made. Naming a protocol stage for work that
// did not happen would put a claim in the record that no call backs up.

import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioAdaptationPolicy } from "../../model/index.ts";
import type { AutomationStudioRuntimeDeterministicDiagnosis } from "./deterministic-diagnosis.ts";
import type { AutomationStudioRuntimeLlmInvocationDecision } from "./llm-invocation.ts";
import { planAutomationStudioRuntimeRecovery, type AutomationStudioRuntimeRecoveryPlan } from "./plan.ts";
import { automationStudioExplorationTraceEvent, type AutomationStudioRuntimeExploration } from "./runtime-exploration.ts";
import {
  AUTOMATION_STUDIO_RECOVERY_LOOP_STAGES,
  buildAutomationStudioRecoveryTrace,
  type AutomationStudioRecoveryTrace,
  type AutomationStudioRecoveryTraceEvent
} from "./trace.ts";

export type AutomationStudioRuntimeRecoveryTraceInput = {
  /** The gate's decision, carrying Stage A's diagnosis. Absent before the gate ran. */
  invocation?: AutomationStudioRuntimeLlmInvocationDecision;
  policy: AutomationStudioAdaptationPolicy;
  /** The plan, when one was built. Absent means it is rebuilt from the diagnosis. */
  plan?: AutomationStudioRuntimeRecoveryPlan;
  /** Why the diagnosis stage could not complete, when something stopped it. */
  diagnosisFailure?: string;
  /** Whether the diagnosis call returned a usable diagnosis. Absent means no call. */
  diagnosisOk?: boolean;
  /** The exploration that ran, when one did. Absent means none was run. */
  exploration?: AutomationStudioRuntimeExploration;
  /** Whether a patch call was made. The receipt for the `implement` stage. */
  patchRequested?: boolean;
  patchAttemptCount?: number;
  adaptationIds?: readonly string[];
  changeProposalIds?: readonly string[];
};

/** The four stages of one runtime recovery, in order, content-free. */
export function automationStudioRuntimeRecoveryTrace(input: AutomationStudioRuntimeRecoveryTraceInput): AutomationStudioRecoveryTrace {
  const deterministic = input.invocation?.diagnosis;
  const plan = input.plan ?? planAutomationStudioRuntimeRecovery({ ...(deterministic ? { deterministic } : {}), policy: input.policy });
  return buildAutomationStudioRecoveryTrace([
    diagnosisEvent(input, plan),
    recoveryPlanEvent(plan),
    automationStudioExplorationTraceEvent({ requested: plan.explorationRequested, ...(input.exploration ? { exploration: input.exploration } : {}) }),
    resolutionEvent(input, plan)
  ]);
}

function diagnosisEvent(input: AutomationStudioRuntimeRecoveryTraceInput, plan: AutomationStudioRuntimeRecoveryPlan): AutomationStudioRecoveryTraceEvent {
  const deterministic = input.invocation?.diagnosis;
  const detail: JsonObject = deterministic
    ? {
      failureClass: deterministic.failureClass,
      candidateKind: deterministic.candidateKind,
      resolution: deterministic.resolution,
      requiredPriorAction: deterministic.requiredPriorAction,
      stillAchievable: plan.diagnosis.stillAchievable,
      deterministicRecoveryPossible: plan.diagnosis.deterministicRecoveryPossible,
      modelFieldCount: plan.diagnosis.modelFields.length,
      refusalCount: plan.diagnosis.refusals.length,
      ...adaptationIdentity(deterministic)
    }
    : { resolution: "unclassified" };
  if (!deterministic) {
    return { stage: "diagnosis", status: "skipped", providerCalled: false, reason: "No failed attempt reached the diagnosis, so nothing was classified.", detail };
  }
  // The deterministic answer alone: the model was never asked, which is L5
  // working rather than something missing.
  if (input.invocation?.invoke === false) {
    return { stage: "diagnosis", status: "completed", providerCalled: false, reason: input.invocation.reason, detail };
  }
  if (input.diagnosisFailure) {
    return { stage: "diagnosis", status: "failed", providerCalled: false, reason: input.diagnosisFailure, detail };
  }
  return {
    stage: "diagnosis",
    status: input.diagnosisOk === false ? "failed" : "completed",
    providerCalled: true,
    loopStage: AUTOMATION_STUDIO_RECOVERY_LOOP_STAGES.diagnosis,
    reason: input.diagnosisOk === false
      ? "The diagnosis call did not return a usable diagnosis, so the deterministic classification stands alone."
      : `The model was asked because ${lowerFirst(deterministic.reason)}`,
    detail
  };
}

function recoveryPlanEvent(plan: AutomationStudioRuntimeRecoveryPlan): AutomationStudioRecoveryTraceEvent {
  return {
    stage: "recovery_plan",
    status: "completed",
    providerCalled: false,
    loopStage: AUTOMATION_STUDIO_RECOVERY_LOOP_STAGES.recovery_plan,
    reason: plan.steps.map((step) => step.reason).join(" "),
    detail: {
      steps: plan.steps.map((step) => step.action),
      allowedPatchKinds: [...plan.allowedPatchKinds],
      policyRefusalCount: plan.policyRefusals.length,
      explorationRequested: plan.explorationRequested,
      patchRequested: plan.patchRequest.request,
      ...(plan.patchRequest.request ? {} : { patchSkipped: plan.patchRequest.reason })
    }
  };
}

function resolutionEvent(input: AutomationStudioRuntimeRecoveryTraceInput, plan: AutomationStudioRuntimeRecoveryPlan): AutomationStudioRecoveryTraceEvent {
  const adaptationCount = input.adaptationIds?.length ?? 0;
  const changeProposalCount = input.changeProposalIds?.length ?? 0;
  const patchAttemptCount = input.patchAttemptCount ?? 0;
  const outcome = resolutionOutcome({ plan, adaptationCount, changeProposalCount, diagnosisFailed: input.diagnosisOk === false || Boolean(input.diagnosisFailure) });
  const produced = adaptationCount > 0 || changeProposalCount > 0;
  // The known adaptation is named where it is the outcome, so a reader can tell
  // which change the run is waiting on without opening the plan.
  const knownAdaptationIds = outcome === "known_adaptation_available" ? input.invocation?.diagnosis?.knownAdaptationIds ?? [] : [];
  return {
    stage: "resolution",
    status: produced ? "completed" : "skipped",
    providerCalled: input.patchRequested === true,
    ...(input.patchRequested === true ? { loopStage: AUTOMATION_STUDIO_RECOVERY_LOOP_STAGES.resolution } : {}),
    // Never "the recovery worked": what was produced is observable now, whether
    // it works is a verdict from evidence observed afterwards.
    reason: resolutionReason(outcome, knownAdaptationIds),
    detail: { outcome, adaptationCount, changeProposalCount, patchAttemptCount, ...(knownAdaptationIds.length ? { knownAdaptationIds: [...knownAdaptationIds] } : {}) }
  };
}

/**
 * Which recorded adaptations the diagnosis turned on, by id and nothing else.
 * Adaptation ids are Core's own identifiers, so naming them keeps the trace
 * free of page content and of any repair target.
 */
function adaptationIdentity(diagnosis: AutomationStudioRuntimeDeterministicDiagnosis): JsonObject {
  return {
    ...(diagnosis.knownAdaptationIds.length ? { knownAdaptationIds: [...diagnosis.knownAdaptationIds] } : {}),
    ...(diagnosis.recurredAdaptationIds?.length ? { recurredAdaptationIds: [...diagnosis.recurredAdaptationIds] } : {})
  };
}

type AutomationStudioRecoveryResolutionOutcome =
  | "deterministic_recovery_required"
  | "known_adaptation_available"
  | "manual_intervention_required"
  | "adaptation_recorded"
  | "proposal_recorded"
  | "diagnosis_failed"
  | "no_change_produced";

function resolutionOutcome(input: {
  plan: AutomationStudioRuntimeRecoveryPlan;
  adaptationCount: number;
  changeProposalCount: number;
  diagnosisFailed: boolean;
}): AutomationStudioRecoveryResolutionOutcome {
  const action = input.plan.steps[0]?.action;
  if (action === "apply_known_recovery") return "deterministic_recovery_required";
  if (action === "apply_known_adaptation") return "known_adaptation_available";
  if (action === "request_manual_intervention") return "manual_intervention_required";
  if (input.adaptationCount > 0) return "adaptation_recorded";
  if (input.changeProposalCount > 0) return "proposal_recorded";
  if (input.diagnosisFailed) return "diagnosis_failed";
  return "no_change_produced";
}

function resolutionReason(outcome: AutomationStudioRecoveryResolutionOutcome, knownAdaptationIds: readonly string[]): string {
  if (outcome === "deterministic_recovery_required") return "A deterministic recovery is available and is what should run next.";
  if (outcome === "known_adaptation_available") {
    const named = knownAdaptationIds.length ? `Validated adaptation ${knownAdaptationIds.join(", ")}` : "A validated adaptation";
    return `${named} already matches this failure and is not yet applied, so the model was not asked. Applying it is what should happen next.`;
  }
  if (outcome === "manual_intervention_required") return "This failure needs a person, so the loop produced no change.";
  if (outcome === "adaptation_recorded") return "An adaptation was recorded. Whether it repairs the failure is decided from evidence observed afterwards.";
  if (outcome === "proposal_recorded") return "A change proposal was recorded for review, and nothing was applied.";
  if (outcome === "diagnosis_failed") return "The diagnosis did not complete, so no change was produced.";
  return "No change was produced.";
}

function lowerFirst(value: string): string {
  return value ? `${value.charAt(0).toLowerCase()}${value.slice(1)}` : value;
}
