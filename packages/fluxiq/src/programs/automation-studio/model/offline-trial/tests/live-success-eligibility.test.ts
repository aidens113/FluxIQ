import { describe, expect, it } from "vitest";
import { isAutomationStudioTrialEvidenceLiveSuccess } from "../index.ts";
import { livePass, recordedPass } from "./trial-evidence-builders.ts";

describe("live-success eligibility", () => {
  it("accepts only a live, whole-run pass that names its live episode", () => {
    expect(isAutomationStudioTrialEvidenceLiveSuccess(livePass())).toBe(true);
  });

  it("refuses every offline pass, whatever its scope", () => {
    expect(isAutomationStudioTrialEvidenceLiveSuccess(recordedPass())).toBe(false);
    expect(isAutomationStudioTrialEvidenceLiveSuccess(recordedPass({ scope: "segment" }))).toBe(false);
    expect(isAutomationStudioTrialEvidenceLiveSuccess(recordedPass({ scope: "supplied_state", evidenceOrigins: ["pure_computation"], sourceEpisodeIds: [] }))).toBe(false);
  });

  it("refuses a live segment pass", () => {
    expect(isAutomationStudioTrialEvidenceLiveSuccess(livePass("run-live-9", { scope: "segment" }))).toBe(false);
  });

  it("refuses a live run that did not pass", () => {
    expect(isAutomationStudioTrialEvidenceLiveSuccess(livePass("run-live-9", { verdict: "fail", reasonCodes: ["assertion_failure"] }))).toBe(false);
  });

  it("refuses a derived copy of a live pass", () => {
    expect(isAutomationStudioTrialEvidenceLiveSuccess(livePass("run-live-9", { provenance: "derived" }))).toBe(false);
  });

  it("refuses input that does not validate, such as a forged live run with no episode", () => {
    expect(isAutomationStudioTrialEvidenceLiveSuccess(livePass("run-live-9", { liveEpisodeId: null }))).toBe(false);
    expect(isAutomationStudioTrialEvidenceLiveSuccess({ verdict: "pass", scope: "full_live_run", evidenceOrigins: ["live"], liveEpisodeId: "run-x" })).toBe(false);
  });
});
