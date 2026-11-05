/**
 * The key, inside a Flow's stored `adaptationPolicySettings`, that records a person chose the
 * Flow's `maxEstimatedCostUsdPerRun`. New Flows store $0.25 as a default, so the value alone
 * cannot say whether $0.25 was chosen; this marker can. Written where a person's settings write
 * comes in (`framework/automation-service/service/flow-settings/cost-limit-choice.ts`).
 */
export const AUTOMATION_STUDIO_COST_LIMIT_CHOSEN_KEY = "maxEstimatedCostUsdPerRunChosen";
