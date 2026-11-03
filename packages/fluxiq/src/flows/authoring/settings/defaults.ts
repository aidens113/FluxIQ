import type { JsonObject } from "../../../core/index.ts";
import { AUTOMATION_STUDIO_DEFAULT_MAX_RECOVERY_ATTEMPTS_PER_SUBFLOW } from "../../executable/recovery/index.ts";
import { AUTOMATION_STUDIO_DEFAULT_MAX_REROUTES_PER_RUN } from "../../executable/recovery/index.ts";
import { AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_DEFAULT_USD } from "../../../runtime/agents/budget/run-cost-ceiling/index.ts";
import { AUTOMATION_STUDIO_INTERVENTION_MODE_VERSION } from "./intervention/index.ts";
import { AUTOMATION_STUDIO_TOKENS_PER_RUN_DEFAULT_CLEARED_KEY } from "./tokens-per-run-default-cleared-key.ts";
import { AUTOMATION_STUDIO_FLOW_SIZE_SETTING } from "./size/index.ts";

/**
 * What a Flow nobody has configured is allowed to do about itself.
 *
 * **Everything, as of 2026-09-28.** Until then this shipped `no_llm_intervention`
 * with a `locked` policy, which meant a Flow created out of the box could not
 * repair itself, re-author a subflow, reroute, retarget an action, create a
 * recovery path or promote what it learned, and every proposal it did make waited
 * on a person. That is the automation's own work, and the product owner's rule is
 * that asking for the automation *is* the permission for it: only a delete or a
 * movement of money reaches a person, and those are gated per action by
 * `runtime/action-permissions/destructive.ts`, not by a standing setting here.
 *
 * A person who wants something narrower still sets it -- these are defaults, and
 * an explicit setting is the one thing that narrows the rule. What changed is
 * which way silence falls. `tests/default-settings.test.ts` pins it.
 */
export function defaultAutomationStudioFlowSettingsMetadata(): JsonObject {
  const trainingModeSettings = {
    mode: "continuous_adaptive",
    trainForRunCount: 3,
    minimumStabilityScore: 0.9,
    allowLlmIntervention: true,
    allowRuntimeRecovery: true,
    allowAdaptationCreation: true,
    proposalApprovalMode: "auto",
    allowPromotion: true,
    requireFirstManualReviewBeforeAutoPromotion: false,
    recoveryBudget: {
      // The runtime's own default retries, `AUTOMATION_STUDIO_DEFAULT_NODE_RETRY_POLICY`
      // less its first attempt: three since the user's rule of 2026-10-07 (t355).
      // Written as a number because the model layer imports no runtime value;
      // `runtime/executor/tests/retry-policy.test.ts` fails if the two disagree,
      // and the runtime floors every node at its default whatever this says, so
      // settings stored at the old 2 still get three retries.
      maxRetriesPerAction: 3,
      maxRecoveryAttemptsPerSubflow: AUTOMATION_STUDIO_DEFAULT_MAX_RECOVERY_ATTEMPTS_PER_SUBFLOW,
      maxReroutesPerRun: AUTOMATION_STUDIO_DEFAULT_MAX_REROUTES_PER_RUN
    },
    // No `maxTokensPerRun`: a run's tokens are bounded by its cost ceiling, not by
    // a count (see `AUTOMATION_STUDIO_TOKENS_PER_RUN_DEFAULT_CLEARED_KEY`).
    budgets: {
      maxInterventionsPerRun: 2,
      maxCostUsdPerTrainingWindow: 5,
      exhaustedBehavior: "ask"
    }
  };
  const adaptationPolicySettings = {
    preset: "adaptive",
    proposalMode: "auto",
    allowRuntimeRecovery: true,
    allowCreateRecoveryPaths: true,
    allowModifySubflows: true,
    allowCreateSubflows: true,
    allowModifyRouter: true,
    allowModifyExpectations: true,
    allowModifyActionTargets: true,
    // Removing or disabling a step of a Flow is editing a Flow, not deleting
    // anything in the world. The real-world `delete` class is what reaches a
    // person, action by action, at the permission gate.
    allowDeleteOrDisableBehavior: true,
    // Not a permission. The permission gate answers every action's real-world
    // consequence; a flag that withheld the acting options outright left a run
    // with nothing to ask about and no way to do what it was asked for.
    allowExternalSideEffects: true,
    requireApprovalForDestructiveChanges: false,
    requireApprovalForExternalSideEffects: false,
    maxInterventionsPerRun: 3,
    // A user-facing default, independent of an isolated test runtime's ceiling.
    maxEstimatedCostUsdPerRun: AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_DEFAULT_USD
  };
  return {
    adaptationModeVersion: AUTOMATION_STUDIO_INTERVENTION_MODE_VERSION,
    adaptationMode: "fully_adaptive",
    trainingMode: trainingModeSettings.mode,
    proposalMode: trainingModeSettings.proposalApprovalMode,
    proposalApprovalMode: trainingModeSettings.proposalApprovalMode,
    trainingModeSettings,
    adaptationPolicySettings,
    llmProvider: "host",
    adaptationPolicyId: "policy.default",
    budgetExhaustedBehavior: "ask",
    frozenScopeCount: 0,
    [AUTOMATION_STUDIO_TOKENS_PER_RUN_DEFAULT_CLEARED_KEY]: true,
    // How many nodes one Subflow may hold (`flow-size/flow-size-settings.ts`).
    // Written into a new Flow so its settings say so; a Flow saved before the
    // setting existed has none and reads the same default.
    [AUTOMATION_STUDIO_FLOW_SIZE_SETTING.metadataKey]: { [AUTOMATION_STUDIO_FLOW_SIZE_SETTING.field]: AUTOMATION_STUDIO_FLOW_SIZE_SETTING.defaultValue }
  };
}
