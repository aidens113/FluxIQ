// Clearing the 12,000-token cap every Flow was created with before 2026-09-30.
//
// The user's order that day: "Remove ANY AND ALL LIMITS ON THE NUMBER OF
// ELEMENTS PASSED TO MODEL." The recovery read the cap as the whole run's token
// budget, so a whole page's diagnosis was refused before it was sent. A stored
// Flow that carries exactly the old default reads as unset; a value a person set
// stays.
import { describe, expect, it } from "vitest";

import type { JsonObject } from "../../../../../../core/index.ts";
import { AUTOMATION_STUDIO_TOKENS_PER_RUN_DEFAULT_CLEARED_KEY, defaultAutomationStudioFlowSettingsMetadata } from "../../../../model/index.ts";
import { mergedFlowSettingsMetadata, trainingModeSettingsFromMetadata, withoutAutomationStudioTokensPerRunDefault } from "../index.ts";

/** Training settings as a Flow created before 2026-09-30 stored them. */
function stored(maxTokensPerRun: number | undefined, extra: JsonObject = {}): JsonObject {
  return {
    adaptationModeVersion: 1,
    adaptationMode: "fully_adaptive",
    trainingModeSettings: {
      mode: "continuous_adaptive",
      budgets: { maxInterventionsPerRun: 2, ...(maxTokensPerRun === undefined ? {} : { maxTokensPerRun }), maxCostUsdPerTrainingWindow: 5, exhaustedBehavior: "ask" }
    },
    ...extra
  };
}

describe("the retired 12,000-token default", () => {
  it("is no longer written into a new Flow, and a new Flow says so", () => {
    const defaults = defaultAutomationStudioFlowSettingsMetadata();
    const budgets = (defaults.trainingModeSettings as JsonObject).budgets as JsonObject;
    expect(budgets).not.toHaveProperty("maxTokensPerRun");
    expect(defaults[AUTOMATION_STUDIO_TOKENS_PER_RUN_DEFAULT_CLEARED_KEY]).toBe(true);
  });

  it("is cleared from a stored Flow that carries exactly it, and the rest of the budgets stay", () => {
    const cleared = withoutAutomationStudioTokensPerRunDefault(stored(12000)) as JsonObject;
    const budgets = (cleared.trainingModeSettings as JsonObject).budgets as JsonObject;
    expect(budgets).toEqual({ maxInterventionsPerRun: 2, maxCostUsdPerTrainingWindow: 5, exhaustedBehavior: "ask" });
    expect(cleared[AUTOMATION_STUDIO_TOKENS_PER_RUN_DEFAULT_CLEARED_KEY]).toBe(true);
    expect((cleared.trainingModeSettings as JsonObject).mode).toBe("continuous_adaptive");
  });

  it("reads as unset once settings are resolved, so nothing caps the run's tokens", () => {
    expect(trainingModeSettingsFromMetadata(mergedFlowSettingsMetadata(stored(12000))).budgets).not.toHaveProperty("maxTokensPerRun");
    expect(trainingModeSettingsFromMetadata(mergedFlowSettingsMetadata(undefined)).budgets).not.toHaveProperty("maxTokensPerRun");
  });

  it("leaves any other value a person set exactly as it is", () => {
    for (const value of [128, 11999, 12001, 22000, 1_000_000]) {
      const metadata = stored(value);
      expect(withoutAutomationStudioTokensPerRunDefault(metadata), String(value)).toBe(metadata);
      expect(trainingModeSettingsFromMetadata(mergedFlowSettingsMetadata(metadata)).budgets?.maxTokensPerRun, String(value)).toBe(value);
    }
  });

  it("leaves a 12,000 a person set after the clearing, on a Flow that already carries the key", () => {
    const metadata = stored(12000, { [AUTOMATION_STUDIO_TOKENS_PER_RUN_DEFAULT_CLEARED_KEY]: true });
    expect(withoutAutomationStudioTokensPerRunDefault(metadata)).toBe(metadata);
    expect(trainingModeSettingsFromMetadata(mergedFlowSettingsMetadata(metadata)).budgets?.maxTokensPerRun).toBe(12000);
  });

  it("is idempotent, and answers for metadata with no settings at all", () => {
    const once = withoutAutomationStudioTokensPerRunDefault(stored(12000));
    expect(withoutAutomationStudioTokensPerRunDefault(once)).toBe(once);
    expect(withoutAutomationStudioTokensPerRunDefault(undefined)).toBeUndefined();
    const empty = { name: "kept" };
    expect(withoutAutomationStudioTokensPerRunDefault(empty)).toBe(empty);
    const noCap = stored(undefined);
    expect(withoutAutomationStudioTokensPerRunDefault(noCap)).toBe(noCap);
  });
});
