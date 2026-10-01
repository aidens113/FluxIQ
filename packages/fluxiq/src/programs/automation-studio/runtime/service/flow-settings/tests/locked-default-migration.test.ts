// Migrating the Flows the locked default already shipped.
//
// The subject is a rule about telling two nearly identical records apart: the
// block a defect wrote into every Flow created before 2026-09-28, and the same
// lock a person chose on purpose. The first has to be cleared and the second
// has to survive, so both are built here from the code that actually produced
// them rather than from a hand-written literal.

import { describe, expect, it } from "vitest";

import type { JsonObject } from "../../../../../../core/index.ts";
import { automationStudioInterventionMode, withAutomationStudioInterventionMode, type AutomationStudioFlowArtifact } from "../../../../model/index.ts";
import {
  AUTOMATION_STUDIO_LOCKED_DEFAULT_CLEARED_KEY,
  adaptationPolicyFromFlowMetadata,
  hasAutomationStudioLockedDefaultSettings,
  mergedFlowSettingsMetadata,
  trainingModeSettingsFromMetadata,
  withoutAutomationStudioLockedDefaultSettings
} from "../index.ts";

/**
 * Exactly what `defaultAutomationStudioFlowSettingsMetadata()` returned before
 * 2026-09-28, which is what every Flow created before then has written into it.
 */
function lockedDefaultMetadata(): JsonObject {
  return {
    adaptationModeVersion: 1,
    adaptationMode: "no_llm_intervention",
    trainingMode: "normal",
    proposalMode: "manual",
    proposalApprovalMode: "manual",
    trainingModeSettings: {
      mode: "normal",
      trainForRunCount: 3,
      minimumStabilityScore: 0.9,
      allowLlmIntervention: false,
      allowRuntimeRecovery: true,
      allowAdaptationCreation: false,
      proposalApprovalMode: "manual",
      allowPromotion: false,
      requireFirstManualReviewBeforeAutoPromotion: true,
      recoveryBudget: { maxRetriesPerAction: 2, maxRecoveryAttemptsPerSubflow: 2, maxReroutesPerRun: 2 },
      budgets: { maxInterventionsPerRun: 2, maxTokensPerRun: 12000, maxCostUsdPerTrainingWindow: 5, exhaustedBehavior: "ask" }
    },
    adaptationPolicySettings: {
      preset: "locked",
      proposalMode: "manual",
      allowRuntimeRecovery: true,
      allowCreateRecoveryPaths: false,
      allowModifySubflows: false,
      allowCreateSubflows: false,
      allowModifyRouter: false,
      allowModifyExpectations: false,
      allowModifyActionTargets: false,
      allowDeleteOrDisableBehavior: false,
      allowExternalSideEffects: false,
      requireApprovalForDestructiveChanges: true,
      requireApprovalForExternalSideEffects: true,
      maxInterventionsPerRun: 3,
      maxEstimatedCostUsdPerRun: 1
    },
    llmProvider: "host",
    adaptationPolicyId: "policy.default",
    budgetExhaustedBehavior: "ask",
    frozenScopeCount: 0
  };
}

function flow(metadata: JsonObject | undefined): AutomationStudioFlowArtifact {
  return { flowId: "flow.one", createdAt: 1, updatedAt: 2, metadata } as unknown as AutomationStudioFlowArtifact;
}

describe("clearing the locked settings a defect shipped", () => {
  it("recognizes the block that default wrote and clears every gate in it", () => {
    const stored = lockedDefaultMetadata();
    expect(hasAutomationStudioLockedDefaultSettings(stored)).toBe(true);
    const cleared = withoutAutomationStudioLockedDefaultSettings(stored);
    expect(cleared?.adaptationMode).toBeUndefined();
    expect(cleared?.adaptationModeVersion).toBeUndefined();
    expect(cleared?.trainingMode).toBeUndefined();
    expect(cleared?.proposalApprovalMode).toBeUndefined();
    expect(Object.keys(cleared?.trainingModeSettings as JsonObject).sort())
      .toEqual(["allowRuntimeRecovery", "budgets", "minimumStabilityScore", "recoveryBudget", "trainForRunCount"]);
    expect(Object.keys(cleared?.adaptationPolicySettings as JsonObject).sort())
      .toEqual(["allowRuntimeRecovery", "maxEstimatedCostUsdPerRun", "maxInterventionsPerRun"]);
  });

  it("leaves everything that is not one of the gates exactly where it was", () => {
    const stored: JsonObject = { ...lockedDefaultMetadata(), llmModel: "deepseek-chat", graphRevision: 14 };
    const cleared = withoutAutomationStudioLockedDefaultSettings(stored) as JsonObject;
    expect(cleared.llmProvider).toBe("host");
    expect(cleared.adaptationPolicyId).toBe("policy.default");
    expect(cleared.budgetExhaustedBehavior).toBe("ask");
    expect(cleared.frozenScopeCount).toBe(0);
    expect(cleared.llmModel).toBe("deepseek-chat");
    expect(cleared.graphRevision).toBe(14);
    const training = cleared.trainingModeSettings as JsonObject;
    expect(training.trainForRunCount).toBe(3);
    expect(training.budgets).toEqual({ maxInterventionsPerRun: 2, maxTokensPerRun: 12000, maxCostUsdPerTrainingWindow: 5, exhaustedBehavior: "ask" });
    expect(training.recoveryBudget).toEqual({ maxRetriesPerAction: 2, maxRecoveryAttemptsPerSubflow: 2, maxReroutesPerRun: 2 });
    const policy = cleared.adaptationPolicySettings as JsonObject;
    expect(policy.maxInterventionsPerRun).toBe(3);
    expect(policy.maxEstimatedCostUsdPerRun).toBe(1);
  });

  // The case this rule exists to get right. A person choosing that mode goes
  // through `withAutomationStudioInterventionMode`, which turns runtime recovery
  // off with the lock; the defective default left it on. Nothing deliberate
  // produces that combination, so the person's choice survives.
  it("leaves a lock a person chose, and clears the one the default wrote", () => {
    const chosen = withAutomationStudioInterventionMode(lockedDefaultMetadata(), "no_llm_intervention");
    expect(hasAutomationStudioLockedDefaultSettings(chosen)).toBe(false);
    expect(withoutAutomationStudioLockedDefaultSettings(chosen)).toBe(chosen);
    expect(automationStudioInterventionMode(chosen)).toBe("no_llm_intervention");
    expect(mergedFlowSettingsMetadata(chosen).adaptationMode).toBe("no_llm_intervention");
  });

  // A person who narrowed one thing narrowed it on purpose. One field away from
  // the block and nothing is touched, whichever field it is.
  it("touches nothing when any single field differs from what that default wrote", () => {
    const differences: Array<[string, (metadata: JsonObject) => void]> = [
      ["a chosen preset", (metadata) => { (metadata.adaptationPolicySettings as JsonObject).preset = "observe"; }],
      ["a chosen training mode", (metadata) => { (metadata.trainingModeSettings as JsonObject).mode = "train_until_stable"; }],
      ["promotion turned on", (metadata) => { (metadata.trainingModeSettings as JsonObject).allowPromotion = true; }],
      ["approval no longer forced", (metadata) => { (metadata.adaptationPolicySettings as JsonObject).requireApprovalForDestructiveChanges = false; }],
      ["rerouting allowed", (metadata) => { (metadata.adaptationPolicySettings as JsonObject).allowModifyRouter = true; }],
      ["runtime recovery turned off", (metadata) => { (metadata.adaptationPolicySettings as JsonObject).allowRuntimeRecovery = false; }],
      ["a stated mode of its own", (metadata) => { metadata.adaptationMode = "manual_approval"; }]
    ];
    for (const [named, change] of differences) {
      const stored = lockedDefaultMetadata();
      change(stored);
      expect(hasAutomationStudioLockedDefaultSettings(stored), named).toBe(false);
      expect(withoutAutomationStudioLockedDefaultSettings(stored), named).toBe(stored);
    }
  });

  it("says on the record that the block was cleared, and clearing twice changes nothing further", () => {
    const once = withoutAutomationStudioLockedDefaultSettings(lockedDefaultMetadata()) as JsonObject;
    expect(once[AUTOMATION_STUDIO_LOCKED_DEFAULT_CLEARED_KEY]).toBe(true);
    expect(hasAutomationStudioLockedDefaultSettings(once)).toBe(false);
    expect(withoutAutomationStudioLockedDefaultSettings(once)).toBe(once);
  });

  it("answers for metadata that is absent or holds no settings at all", () => {
    expect(hasAutomationStudioLockedDefaultSettings(undefined)).toBe(false);
    expect(withoutAutomationStudioLockedDefaultSettings(undefined)).toBeUndefined();
    expect(hasAutomationStudioLockedDefaultSettings({})).toBe(false);
    expect(withoutAutomationStudioLockedDefaultSettings({ name: "kept" })).toEqual({ name: "kept" });
  });
});

describe("what a migrated Flow is then allowed to do", () => {
  const settings = mergedFlowSettingsMetadata(lockedDefaultMetadata());

  it("may invoke a model, author a repair and keep what it learned", () => {
    const training = trainingModeSettingsFromMetadata(settings);
    expect(training.mode).toBe("continuous_adaptive");
    expect(training.allowLlmIntervention).toBe(true);
    expect(training.allowAdaptationCreation).toBe(true);
    expect(training.allowPromotion).toBe(true);
    expect(training.proposalApprovalMode).toBe("auto");
  });

  it("may re-author every part of itself, with no approval forced on any of it", () => {
    const policy = adaptationPolicyFromFlowMetadata(flow(undefined), settings);
    expect(policy.preset).toBe("adaptive");
    expect(policy.allowRuntimeRecovery).toBe(true);
    expect(policy.allowCreateRecoveryPaths).toBe(true);
    expect(policy.allowModifySubflows).toBe(true);
    expect(policy.allowCreateSubflows).toBe(true);
    expect(policy.allowModifyRouter).toBe(true);
    expect(policy.allowModifyExpectations).toBe(true);
    expect(policy.allowModifyActionTargets).toBe(true);
    expect(policy.allowDeleteOrDisableBehavior).toBe(true);
    expect(policy.allowExternalSideEffects).toBe(true);
    expect(policy.requireApprovalForDestructiveChanges).toBe(false);
    expect(policy.requireApprovalForExternalSideEffects).toBe(false);
  });

  it("reads as fully adaptive, where before the migration it read as no intervention at all", () => {
    expect(automationStudioInterventionMode(lockedDefaultMetadata())).toBe("no_llm_intervention");
    expect(settings.adaptationMode).toBe("fully_adaptive");
  });

  // The budgets are not gates and were never the defect, so a Flow keeps the
  // ones it was created with rather than being reset to today's numbers -- all
  // but the 12,000-token cap, which was Core's own default and is cleared on its
  // own account (`../tokens-per-run-default-migration.ts`, 2026-09-30).
  it("keeps the budgets the Flow was created with, except the retired token cap", () => {
    const training = trainingModeSettingsFromMetadata(settings);
    expect(training.trainForRunCount).toBe(3);
    expect(training.budgets?.maxInterventionsPerRun).toBe(2);
    expect(training.budgets).not.toHaveProperty("maxTokensPerRun");
    expect(training.recoveryBudget?.maxRetriesPerAction).toBe(2);
  });
});
