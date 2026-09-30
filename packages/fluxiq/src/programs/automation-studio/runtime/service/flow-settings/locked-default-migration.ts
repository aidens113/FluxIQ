import type { JsonObject } from "../../../../../core/index.ts";
import { jsonObjectFromUnknown } from "../json-values.ts";

// Clearing the locked settings a defect wrote into every Flow created before
// 2026-09-28.
//
// **What happened.** `defaultAutomationStudioFlowSettingsMetadata()` shipped
// every new Flow as `no_llm_intervention` with a `locked` adaptation policy:
// no repair, no re-authoring a subflow, no rerouting, no retargeting a failed
// action, no recovery path, nothing learned kept, and every proposal waiting on
// a person. That is the automation's own work, and the product owner's rule is
// that asking for the automation is itself the permission for it. The default was
// corrected on 2026-09-28, but a default is only what gets *written*: every
// Flow created before that carries those settings explicitly, in its own
// metadata, and goes on reading exactly as it did. A person who created a Flow
// last week still has one that cannot repair itself and nothing tells them so.
//
// **What this clears, and what it must never clear.** Only the gating fields
// the defective default wrote, and only when *every one of them* is still at
// the value that default gave it. One field different anywhere in the block and
// nothing is touched, because a difference means somebody configured this Flow
// and a setting a person chose is the one thing that narrows the rule.
// Everything outside the block -- budgets, the training window, the provider,
// the policy id, anything a caller added -- is left exactly as it was.
//
// **How a person's own `no_llm_intervention` is told apart from the defect's.**
// This is the case worth stating plainly, because the two look almost
// identical. A person choosing that mode goes through
// `withAutomationStudioInterventionMode`, which writes
// `adaptationPolicySettings.allowRuntimeRecovery: false` along with the lock.
// The defective default left that field `true` while locking everything around
// it -- an inconsistency nothing deliberate produces. So the fingerprint
// requires it to be `true`, and a Flow a person locked on purpose fails to
// match and is left alone. `tests/locked-default-migration.test.ts` drives both.
//
// The clearing is applied where a Flow is read (`service/flows/store.ts`,
// `getFlow`) and again where its settings are resolved
// (`merged-metadata.ts`), so a Flow reads as un-gated immediately and the next
// save writes the corrected metadata down. It is idempotent: once the block is
// gone the fingerprint no longer matches.

/** Left on a Flow whose locked block was cleared, so the reason it has no stated mode is on the record. */
export const AUTOMATION_STUDIO_LOCKED_DEFAULT_CLEARED_KEY = "lockedDefaultSettingsCleared";

/** The top-level keys the defective default wrote, and the value each one had. */
const TOP_LEVEL: Readonly<Record<string, unknown>> = Object.freeze({
  adaptationModeVersion: 1,
  adaptationMode: "no_llm_intervention",
  trainingMode: "normal",
  proposalMode: "manual",
  proposalApprovalMode: "manual"
});

/** The training-mode gates it wrote. `allowRuntimeRecovery` is not one: it was left `true` and stays. */
const TRAINING_MODE: Readonly<Record<string, unknown>> = Object.freeze({
  mode: "normal",
  allowLlmIntervention: false,
  allowAdaptationCreation: false,
  proposalApprovalMode: "manual",
  allowPromotion: false,
  requireFirstManualReviewBeforeAutoPromotion: true
});

/** The adaptation-policy gates it wrote. Same exception: `allowRuntimeRecovery` was `true` and stays. */
const ADAPTATION_POLICY: Readonly<Record<string, unknown>> = Object.freeze({
  preset: "locked",
  proposalMode: "manual",
  allowCreateRecoveryPaths: false,
  allowModifySubflows: false,
  allowCreateSubflows: false,
  allowModifyRouter: false,
  allowModifyExpectations: false,
  allowModifyActionTargets: false,
  allowDeleteOrDisableBehavior: false,
  allowExternalSideEffects: false,
  requireApprovalForDestructiveChanges: true,
  requireApprovalForExternalSideEffects: true
});

/**
 * Whether this metadata carries the defective default's lock and nothing a
 * person put there.
 *
 * Every gate has to match, and the two `allowRuntimeRecovery` fields have to be
 * `true` -- the combination that only the defect produced.
 */
export function hasAutomationStudioLockedDefaultSettings(metadata: JsonObject | undefined): boolean {
  if (!metadata) return false;
  const training = jsonObjectFromUnknown(metadata.trainingModeSettings);
  const policy = jsonObjectFromUnknown(metadata.adaptationPolicySettings);
  if (!training || !policy) return false;
  if (training.allowRuntimeRecovery !== true || policy.allowRuntimeRecovery !== true) return false;
  return matches(metadata, TOP_LEVEL) && matches(training, TRAINING_MODE) && matches(policy, ADAPTATION_POLICY);
}

/**
 * The same metadata with the defective default's gates removed, or the metadata
 * unchanged when it is not the defect's.
 *
 * Removing rather than rewriting is deliberate. What is left is silence, and
 * silence now permits -- `settings-readings.ts` and `adaptation-policy.ts` fall
 * open, and `merged-metadata.ts` fills the rest from the corrected default. A
 * Flow migrated this way therefore tracks the default from here on instead of
 * freezing today's answer into its own record.
 */
export function withoutAutomationStudioLockedDefaultSettings(metadata: JsonObject | undefined): JsonObject | undefined {
  if (!hasAutomationStudioLockedDefaultSettings(metadata) || !metadata) return metadata;
  const next: JsonObject = { ...metadata, [AUTOMATION_STUDIO_LOCKED_DEFAULT_CLEARED_KEY]: true };
  for (const key of Object.keys(TOP_LEVEL)) delete next[key];
  assignRemaining(next, "trainingModeSettings", jsonObjectFromUnknown(metadata.trainingModeSettings), TRAINING_MODE);
  assignRemaining(next, "adaptationPolicySettings", jsonObjectFromUnknown(metadata.adaptationPolicySettings), ADAPTATION_POLICY);
  return next;
}

function assignRemaining(target: JsonObject, key: string, source: JsonObject | null, cleared: Readonly<Record<string, unknown>>): void {
  if (!source) return;
  const remaining: JsonObject = { ...source };
  for (const field of Object.keys(cleared)) delete remaining[field];
  if (Object.keys(remaining).length === 0) delete target[key];
  else target[key] = remaining;
}

function matches(source: JsonObject, expected: Readonly<Record<string, unknown>>): boolean {
  return Object.entries(expected).every(([key, value]) => source[key] === value);
}
