// The offline trial runner is published through Automation Studio's runtime
// barrel, and so through the package's `./automation-studio` entry, which a
// downstream Lab calls it by.
import { describe, expect, it } from "vitest";
import * as automationStudio from "../../../../index.ts";
import * as runtime from "../../../index.ts";
import { AUTOMATION_STUDIO_OFFLINE_TRIAL_READER_CONTRACTS, automationStudioOfflineTrialEvidenceResult, runAutomationStudioOfflineCandidateTrial } from "../index.ts";

describe("the offline trial runner's export", () => {
  it("resolves from the runtime barrel and the Automation Studio entry to the runner itself", () => {
    expect(runtime.runAutomationStudioOfflineCandidateTrial).toBe(runAutomationStudioOfflineCandidateTrial);
    expect(automationStudio.runAutomationStudioOfflineCandidateTrial).toBe(runAutomationStudioOfflineCandidateTrial);
    expect(automationStudio.automationStudioOfflineTrialEvidenceResult).toBe(automationStudioOfflineTrialEvidenceResult);
    expect(automationStudio.AUTOMATION_STUDIO_OFFLINE_TRIAL_READER_CONTRACTS).toBe(AUTOMATION_STUDIO_OFFLINE_TRIAL_READER_CONTRACTS);
  });
});
