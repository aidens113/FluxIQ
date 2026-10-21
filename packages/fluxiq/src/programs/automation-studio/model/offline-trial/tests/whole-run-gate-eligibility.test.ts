import { describe, expect, it } from "vitest";
import { satisfiesAutomationStudioWholeRunGate, validateAutomationStudioTrialEvidenceResult } from "../index.ts";
import { livePass, recordedPass } from "./trial-evidence-builders.ts";

const subject = { candidateRevision: 3, candidateDigest: "digest-3", goalContractVersion: "goal-1" };

describe("whole-run gate eligibility", () => {
  it("is satisfied by a live whole-run pass of the same candidate and goal contract", () => {
    expect(satisfiesAutomationStudioWholeRunGate(livePass(), subject)).toBe(true);
  });

  it("is never satisfied by an offline pass, even over the full recorded path", () => {
    expect(satisfiesAutomationStudioWholeRunGate(recordedPass(), subject)).toBe(false);
    expect(satisfiesAutomationStudioWholeRunGate(recordedPass({ evidenceOrigins: ["recorded", "live"], scope: "segment", liveEpisodeId: "run-live-2" }), subject)).toBe(false);
  });

  it("is never satisfied by an offline pass whose reads were reevaluated on a recorded snapshot", () => {
    const reevaluated = recordedPass({ evidenceOrigins: ["recorded", "pure_computation", "snapshot_evaluation"] });
    expect(validateAutomationStudioTrialEvidenceResult(reevaluated).ok).toBe(true);
    expect(satisfiesAutomationStudioWholeRunGate(reevaluated, subject)).toBe(false);
    expect(satisfiesAutomationStudioWholeRunGate(recordedPass({ evidenceOrigins: ["snapshot_evaluation"], scope: "segment" }), subject)).toBe(false);
  });

  it("is not satisfied by a live pass of another revision, digest or goal contract", () => {
    expect(satisfiesAutomationStudioWholeRunGate(livePass("run-live-9", { candidateRevision: 2 }), subject)).toBe(false);
    expect(satisfiesAutomationStudioWholeRunGate(livePass("run-live-9", { candidateDigest: "digest-other" }), subject)).toBe(false);
    expect(satisfiesAutomationStudioWholeRunGate(livePass("run-live-9", { goalContractVersion: "goal-2" }), subject)).toBe(false);
  });

  it("is not satisfied by a derived copy of a live pass", () => {
    expect(satisfiesAutomationStudioWholeRunGate(livePass("run-live-9", { provenance: "derived" }), subject)).toBe(false);
  });
});
