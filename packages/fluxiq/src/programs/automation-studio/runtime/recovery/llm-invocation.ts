import type { AutomationStudioAdaptationPolicy, AutomationStudioFlowAdaptation } from "../../model/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../executor.ts";
import { decideAutomationStudioLlmInvocationGate, type AutomationStudioTrainingBudgetState, type AutomationStudioTrainingModeSettings } from "../training-modes.ts";
import {
  buildAutomationStudioRuntimeDeterministicDiagnosis,
  type AutomationStudioRuntimeDeterministicDiagnosis,
  type AutomationStudioRuntimeDiagnosisPriorAction
} from "./deterministic-diagnosis.ts";

export type AutomationStudioRuntimeLlmInvocationDecision = {
  invoke: boolean;
  reason: string;
  requiredPriorAction: AutomationStudioRuntimeDiagnosisPriorAction;
  knownRecoveryAvailable: boolean;
  rerouteAvailable: boolean;
  knownAdaptationAvailable: boolean;
  /**
   * Stage A's answer, present whenever there was a failed attempt to classify.
   * The gate is one reading of it; the recovery plan and the recovery trace are
   * others, and all three read this one diagnosis rather than reclassifying and
   * risking three answers to the same question.
   */
  diagnosis?: AutomationStudioRuntimeDeterministicDiagnosis;
};

export type AutomationStudioRuntimeLlmInvocationInput = {
  projectId: string;
  flowId: string;
  runId: string;
  subflowId?: string;
  settings: AutomationStudioTrainingModeSettings;
  policy: AutomationStudioAdaptationPolicy;
  runsCompleted?: number;
  stabilityScore?: number;
  budgetState?: AutomationStudioTrainingBudgetState;
  /** The attempt as the run executed it; without one there is nothing to classify. */
  failedAttempt?: AutomationStudioNodeAttemptTrace;
  adaptations?: AutomationStudioFlowAdaptation[];
};

/**
 * Deterministic-first: whether the model should be asked at all.
 *
 * Two refusals meet here and they are different in kind, which is why both are
 * consulted rather than one being folded into the other.
 *
 * `deterministic-diagnosis.ts` answers *what is wrong*, and refuses the model
 * whenever something cheaper and more reliable already answers it: a
 * deterministic recovery candidate sitting in the attempt, a validated
 * adaptation that matched this failure before, or a failure class whose next
 * move belongs to a person rather than to any model. That is decision L5 in
 * full, and it is the half that was missing — the classifier implemented it
 * correctly and had no production caller.
 *
 * `decideAutomationStudioLlmInvocationGate` answers *whether asking is allowed
 * here*: training mode, budget, policy preset, approval mode. Only its
 * deterministic-first refusals are acted on, because the mode, budget and
 * approval gates it also applies are already enforced at the call site, and
 * applying them twice would refuse work that is allowed today. It is still
 * asked first so that the sentence a run records for "a deterministic path must
 * run first" stays the gate's own wording, unchanged by this phase.
 */
export function decideAutomationStudioRuntimeLlmInvocation(input: AutomationStudioRuntimeLlmInvocationInput): AutomationStudioRuntimeLlmInvocationDecision {
  const allowed: AutomationStudioRuntimeLlmInvocationDecision = {
    invoke: true,
    reason: "No deterministic recovery is available for this failure.",
    requiredPriorAction: "none",
    knownRecoveryAvailable: false,
    rerouteAvailable: false,
    knownAdaptationAvailable: false
  };
  if (!input.failedAttempt) return allowed;
  const diagnosis = buildAutomationStudioRuntimeDeterministicDiagnosis({
    projectId: input.projectId,
    flowId: input.flowId,
    runId: input.runId,
    ...(input.subflowId ? { subflowId: input.subflowId } : {}),
    failedAttempt: input.failedAttempt,
    ...(input.adaptations?.length ? { adaptations: input.adaptations } : {})
  });
  const gate = decideAutomationStudioLlmInvocationGate({
    settings: input.settings,
    policyPreset: input.policy.preset === "autonomous" ? "adaptive" : input.policy.preset,
    knownRecoveryAvailable: diagnosis.deterministicRecoveryAvailable,
    rerouteAvailable: diagnosis.rerouteAvailable,
    ...(input.runsCompleted !== undefined ? { runsCompleted: input.runsCompleted } : {}),
    ...(input.stabilityScore !== undefined ? { stabilityScore: input.stabilityScore } : {}),
    ...(input.budgetState ? { budgetState: input.budgetState } : {})
  });
  const observed = {
    knownRecoveryAvailable: diagnosis.deterministicRecoveryAvailable,
    rerouteAvailable: diagnosis.rerouteAvailable,
    knownAdaptationAvailable: diagnosis.knownAdaptationAvailable,
    diagnosis
  };
  if (!gate.invoke && (gate.requiredPriorAction === "known_recovery" || gate.requiredPriorAction === "reroute")) {
    return { invoke: false, reason: gate.reason, requiredPriorAction: gate.requiredPriorAction, ...observed };
  }
  if (!diagnosis.modelNeeded) {
    return { invoke: false, reason: diagnosis.reason, requiredPriorAction: diagnosis.requiredPriorAction, ...observed };
  }
  return { ...allowed, ...observed };
}

/**
 * How many recent adaptations are loaded in full for matching. Summaries carry
 * no failed action, so matching needs the records, and the bound keeps a run
 * from reading the whole adaptation history.
 */
export const AUTOMATION_STUDIO_KNOWN_ADAPTATION_LOAD_LIMIT = 25;
