// The confidence tier a change's saved validation results earn. Only trials and
// replays count; a structural check is never a validation result. Results are
// read in the order they were checked.
//
// - `unverified`: no succeeded trial or replay, or a failure (trial or replay)
//   after the last success.
// - `provisional`: at least one success, and fewer succeeded replays since the
//   last failure than the change needs.
// - `established`: enough succeeded replays since the last failure, and no
//   failure after them.
import type { AutomationStudioAdaptationRiskLevel, AutomationStudioFlowAdaptationValidationResult, AutomationStudioFlowChangeValidationKind } from "../../model/index.ts";
import type { AutomationStudioChangeConfidenceDecision, AutomationStudioChangeConfidenceInput } from "./contracts.ts";

/** Succeeded replays a low- or medium-risk change needs before it is `established`. */
export const AUTOMATION_STUDIO_CHANGE_CONFIDENCE_DEFAULT_REPLAYS = 2;

/**
 * The kind a stored validation result counts as: `trial` when it names none
 * (every result written before kinds existed came from a live patch rerun),
 * and undefined for a value that is neither kind, which then counts for nothing.
 */
export function automationStudioValidationResultKind(result: Pick<AutomationStudioFlowAdaptationValidationResult, "kind">): AutomationStudioFlowChangeValidationKind | undefined {
  const kind: unknown = result.kind;
  if (kind === undefined) return "trial";
  return kind === "trial" || kind === "replay" ? kind : undefined;
}

export function decideAutomationStudioChangeConfidence(input: AutomationStudioChangeConfidenceInput): AutomationStudioChangeConfidenceDecision {
  const replaysRequired = requiredReplays(input.replaysRequired, input.riskLevel);
  const counted = input.validationResults
    .map((result, index) => ({ result, index, kind: automationStudioValidationResultKind(result) }))
    .filter((entry): entry is { result: AutomationStudioFlowAdaptationValidationResult; index: number; kind: AutomationStudioFlowChangeValidationKind } =>
      entry.kind !== undefined
      && (entry.result.status === "succeeded" || entry.result.status === "failed")
      && Number.isFinite(entry.result.checkedAt))
    .sort((left, right) => left.result.checkedAt - right.result.checkedAt || left.index - right.index);

  let trials = 0;
  let replays = 0;
  let succeededEver = false;
  let failedSinceSuccess = false;
  let lastFailure: AutomationStudioFlowChangeValidationKind | undefined;
  for (const entry of counted) {
    if (entry.result.status === "succeeded") {
      succeededEver = true;
      failedSinceSuccess = false;
      if (entry.kind === "trial") trials += 1;
      else replays += 1;
      continue;
    }
    lastFailure = entry.kind;
    replays = 0;
    if (succeededEver) failedSinceSuccess = true;
  }

  const tier = !succeededEver || failedSinceSuccess
    ? "unverified"
    : replays >= replaysRequired ? "established" : "provisional";
  return { tier, trials, replays, replaysRequired, ...(lastFailure ? { lastFailure } : {}) };
}

// A change that can do harm needs one replay more before it is trusted.
function requiredReplays(requested: number | undefined, riskLevel: AutomationStudioAdaptationRiskLevel): number {
  const base = requested !== undefined && Number.isFinite(requested)
    ? Math.max(1, Math.floor(requested))
    : AUTOMATION_STUDIO_CHANGE_CONFIDENCE_DEFAULT_REPLAYS;
  return riskLevel === "high" || riskLevel === "destructive" ? base + 1 : base;
}
