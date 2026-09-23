import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioTrainingModeSettings } from "../../training-modes.ts";
import { jsonObjectFromUnknown } from "../json-values.ts";
import { finiteNumber } from "../scalar-readings/index.ts";
import { resultCheckConfigurationFromMetadata } from "./result-check-settings.ts";
import { approvalModeValue, booleanSetting, trainingModeValue } from "./settings-readings.ts";

// The training-mode settings a Flow's metadata describes: the mode, the
// budgets, and what the mode is allowed to do.

export function trainingModeSettingsFromMetadata(metadata: JsonObject): AutomationStudioTrainingModeSettings {
  const settings = jsonObjectFromUnknown(metadata.trainingModeSettings) ?? {};
  const budgets = jsonObjectFromUnknown(settings.budgets) ?? {};
  const recoveryBudget = jsonObjectFromUnknown(settings.recoveryBudget) ?? {};
  const trainForRunCount = finiteNumber(settings.trainForRunCount);
  const stableRunThreshold = finiteNumber(settings.stableRunThreshold);
  const minimumStabilityScore = finiteNumber(settings.minimumStabilityScore);
  const maxInterventionsPerRun = finiteNumber(budgets.maxInterventionsPerRun);
  const maxTokensPerRun = finiteNumber(budgets.maxTokensPerRun);
  const maxCostUsdPerTrainingWindow = finiteNumber(budgets.maxCostUsdPerTrainingWindow);
  const maxRetriesPerAction = finiteNumber(recoveryBudget.maxRetriesPerAction);
  const maxRecoveryAttemptsPerSubflow = finiteNumber(recoveryBudget.maxRecoveryAttemptsPerSubflow);
  const maxReroutesPerRun = finiteNumber(recoveryBudget.maxReroutesPerRun);
  return {
    mode: trainingModeValue(settings.mode ?? metadata.trainingMode),
    ...(trainForRunCount !== undefined ? { trainForRunCount } : {}),
    ...(stableRunThreshold !== undefined ? { stableRunThreshold } : {}),
    ...(minimumStabilityScore !== undefined ? { minimumStabilityScore } : {}),
    allowLlmIntervention: booleanSetting(settings.allowLlmIntervention, false),
    allowRuntimeRecovery: booleanSetting(settings.allowRuntimeRecovery, true),
    allowAdaptationCreation: booleanSetting(settings.allowAdaptationCreation, false),
    proposalApprovalMode: approvalModeValue(settings.proposalApprovalMode ?? metadata.proposalApprovalMode ?? metadata.proposalMode),
    allowPromotion: booleanSetting(settings.allowPromotion, false),
    requireFirstManualReviewBeforeAutoPromotion: booleanSetting(settings.requireFirstManualReviewBeforeAutoPromotion ?? metadata.requireFirstManualReviewBeforeAutoPromotion, false),
    resultCheck: resultCheckConfigurationFromMetadata(settings),
    recoveryBudget: {
      ...(maxRetriesPerAction !== undefined ? { maxRetriesPerAction } : {}),
      ...(maxRecoveryAttemptsPerSubflow !== undefined ? { maxRecoveryAttemptsPerSubflow } : {}),
      ...(maxReroutesPerRun !== undefined ? { maxReroutesPerRun } : {})
    },
    budgets: {
      ...(maxInterventionsPerRun !== undefined ? { maxInterventionsPerRun } : {}),
      ...(maxTokensPerRun !== undefined ? { maxTokensPerRun } : {}),
      ...(maxCostUsdPerTrainingWindow !== undefined ? { maxCostUsdPerTrainingWindow } : {}),
      exhaustedBehavior: budgets.exhaustedBehavior === "stop" ? "stop" : "ask"
    }
  };
}
