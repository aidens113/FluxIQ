// Test-only builders for trial evidence results.
import type { AutomationStudioTrialEvidenceResult } from "../index.ts";

/** A valid offline pass over a full recorded path from one live episode. */
export function recordedPass(overrides: Partial<AutomationStudioTrialEvidenceResult> = {}): AutomationStudioTrialEvidenceResult {
  const base: AutomationStudioTrialEvidenceResult = {
    verdict: "pass",
    evidenceOrigins: ["recorded", "pure_computation"],
    scope: "full_recorded_path",
    candidateRevision: 3,
    candidateDigest: "digest-3",
    goalContractVersion: "goal-1",
    sourceEpisodeIds: ["run-live-1"],
    liveEpisodeId: null,
    supported: { observations: ["read rows"], operations: ["filter rows"] },
    assertionsChecked: [{ id: "output-has-rows", outcome: "satisfied" }],
    reasonCodes: [],
    missingEvidence: [],
    provenance: "original"
  };
  return { ...base, ...overrides };
}

/** A valid whole live run that passed, observed in `episode`. */
export function livePass(episode = "run-live-9", overrides: Partial<AutomationStudioTrialEvidenceResult> = {}): AutomationStudioTrialEvidenceResult {
  const base: AutomationStudioTrialEvidenceResult = {
    verdict: "pass",
    evidenceOrigins: ["live"],
    scope: "full_live_run",
    candidateRevision: 3,
    candidateDigest: "digest-3",
    goalContractVersion: "goal-1",
    sourceEpisodeIds: [],
    liveEpisodeId: episode,
    supported: { observations: ["read rows"], operations: ["save record"] },
    assertionsChecked: [{ id: "output-has-rows", outcome: "satisfied" }],
    reasonCodes: [],
    missingEvidence: [],
    provenance: "original"
  };
  return { ...base, ...overrides };
}
