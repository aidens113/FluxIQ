import type { AutomationStudioAdaptationPolicy, AutomationStudioFlowAdaptation } from "../../model/index.ts";
import { classifyAutomationStudioAdaptiveFailure } from "../adaptive-orchestrator.ts";
import type { AutomationStudioNodeAttemptTrace } from "../executor.ts";
import { decideAutomationStudioLlmInvocationGate, type AutomationStudioTrainingBudgetState, type AutomationStudioTrainingModeSettings } from "../training-modes.ts";

export type AutomationStudioRuntimeLlmInvocationDecision = {
  invoke: boolean;
  reason: string;
  requiredPriorAction: "none" | "known_recovery" | "reroute";
  knownRecoveryAvailable: boolean;
  rerouteAvailable: boolean;
  knownAdaptationAvailable: boolean;
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
 * `decideAutomationStudioLlmInvocationGate` already implements this correctly
 * and had no production caller; this is the seam that calls it. Only its
 * deterministic-first refusals are acted on here — a known recovery or a
 * reroute that must run first — because the mode, budget and approval-mode
 * gates it also applies are already enforced at the call site, and applying
 * them twice would refuse work that is allowed today.
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
  const failure = classifyAutomationStudioAdaptiveFailure({
    projectId: input.projectId,
    flowId: input.flowId,
    runId: input.runId,
    ...(input.subflowId ? { subflowId: input.subflowId } : {}),
    attempt: input.failedAttempt,
    ...(input.adaptations?.length ? { adaptations: input.adaptations } : {})
  });
  const rerouteAvailable = failure.deterministicRecoveryCandidates.some((candidate) => candidate.kind === "reroute");
  const gate = decideAutomationStudioLlmInvocationGate({
    settings: input.settings,
    policyPreset: input.policy.preset === "autonomous" ? "adaptive" : input.policy.preset,
    knownRecoveryAvailable: failure.llmEligibility.knownRecoveryAvailable,
    rerouteAvailable,
    ...(input.runsCompleted !== undefined ? { runsCompleted: input.runsCompleted } : {}),
    ...(input.stabilityScore !== undefined ? { stabilityScore: input.stabilityScore } : {}),
    ...(input.budgetState ? { budgetState: input.budgetState } : {})
  });
  const observed = {
    knownRecoveryAvailable: failure.llmEligibility.knownRecoveryAvailable,
    rerouteAvailable,
    knownAdaptationAvailable: failure.llmEligibility.knownAdaptationAvailable
  };
  if (!gate.invoke && (gate.requiredPriorAction === "known_recovery" || gate.requiredPriorAction === "reroute")) {
    return { invoke: false, reason: gate.reason, requiredPriorAction: gate.requiredPriorAction, ...observed };
  }
  return { ...allowed, ...observed };
}

/**
 * How many recent adaptations are loaded in full for matching. Summaries carry
 * no failed action, so matching needs the records, and the bound keeps a run
 * from reading the whole adaptation history.
 */
export const AUTOMATION_STUDIO_KNOWN_ADAPTATION_LOAD_LIMIT = 25;
