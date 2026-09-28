import { describe, expect, it } from "vitest";
import {
  AUTOMATION_STUDIO_INTERVENTION_MODE_VERSION,
  automationStudioInterventionMode,
  defaultAutomationStudioFlowSettingsMetadata,
  withAutomationStudioInterventionMode,
  type AutomationStudioInterventionMode
} from "../flows.ts";

describe("Automation Studio intervention mode compatibility", () => {
  // Changed on 2026-09-28. A new Flow used to default to `no_llm_intervention`
  // with manual proposals, which meant it could not repair itself, re-author a
  // subflow or keep what it learned until somebody went and switched it on.
  // Repairing and re-authoring are the automation's own work, and asking for the
  // automation is the grant for it; a person who wants it narrower still says
  // so, and every row below shows that their saying so is still honoured. The
  // rule itself is pinned in `programs/automation-studio/tests/permission-defaults.test.ts`.
  it("defaults new Flows to adapting themselves, with proposals applied automatically", () => {
    const metadata = defaultAutomationStudioFlowSettingsMetadata();
    expect(metadata).toMatchObject({
      adaptationMode: "fully_adaptive",
      adaptationModeVersion: AUTOMATION_STUDIO_INTERVENTION_MODE_VERSION,
      proposalMode: "auto",
      trainingModeSettings: { mode: "continuous_adaptive", allowLlmIntervention: true, allowAdaptationCreation: true, allowPromotion: true }
    });
    expect(automationStudioInterventionMode(metadata)).toBe("fully_adaptive");
  });

  it.each([
    [{ trainingMode: "normal" }, "no_llm_intervention"],
    [{ adaptationPolicySettings: { preset: "locked" } }, "no_llm_intervention"],
    [{ proposalMode: "disabled" }, "no_llm_intervention"],
    [{ proposalApprovalMode: "deterministic" }, "no_llm_intervention"],
    [{ proposalMode: "manual" }, "manual_approval"],
    [{ proposalMode: "mixed" }, "manual_approval"],
    [{ proposalMode: "manual_approval" }, "manual_approval"],
    [{ adaptationPolicySettings: { preset: "observe" } }, "manual_approval"],
    [{ adaptationPolicySettings: { preset: "repair" } }, "manual_approval"],
    [{ trainingMode: "continuous_adaptive", proposalMode: "auto" }, "fully_adaptive"]
  ] as const)("maps legacy metadata %j to %s", (metadata, expected) => {
    expect(automationStudioInterventionMode(metadata)).toBe(expected);
  });

  it.each(["fully_adaptive", "manual_approval", "no_llm_intervention"] satisfies AutomationStudioInterventionMode[])("round trips canonical mode %s at the current version", (mode) => {
    const metadata = withAutomationStudioInterventionMode({ retained: "value" }, mode);
    expect(metadata).toMatchObject({ adaptationMode: mode, adaptationModeVersion: AUTOMATION_STUDIO_INTERVENTION_MODE_VERSION, retained: "value" });
    expect(automationStudioInterventionMode(metadata)).toBe(mode);
  });

  it("trusts only recognized current-version values and falls back for invalid versioned data", () => {
    expect(automationStudioInterventionMode({ adaptationModeVersion: 1, adaptationMode: "manual_approval", proposalMode: "auto" })).toBe("manual_approval");
    expect(automationStudioInterventionMode({ adaptationModeVersion: 99, adaptationMode: "manual_approval", proposalMode: "auto" })).toBe("fully_adaptive");
  });
});
