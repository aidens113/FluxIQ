import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_TRIAL_EVIDENCE_REASON_CODES, validateAutomationStudioTrialEvidenceResult } from "../index.ts";
import { livePass, recordedPass } from "./trial-evidence-builders.ts";

function codes(input: unknown): string[] {
  const answer = validateAutomationStudioTrialEvidenceResult(input);
  return answer.ok ? [] : answer.issues.map((issue) => issue.code);
}

describe("trial evidence result validation", () => {
  it("accepts a recorded pass and a live pass", () => {
    expect(validateAutomationStudioTrialEvidenceResult(recordedPass()).ok).toBe(true);
    expect(validateAutomationStudioTrialEvidenceResult(livePass()).ok).toBe(true);
  });

  it("deduplicates origins and episode ids into a canonical order", () => {
    const answer = validateAutomationStudioTrialEvidenceResult(recordedPass({ evidenceOrigins: ["pure_computation", "recorded", "recorded"], sourceEpisodeIds: ["run-b", "run-a", "run-b"] }));
    expect(answer.ok && answer.result.evidenceOrigins).toEqual(["recorded", "pure_computation"]);
    expect(answer.ok && answer.result.sourceEpisodeIds).toEqual(["run-b", "run-a"]);
  });

  it("does not alias the input", () => {
    const input = recordedPass();
    const answer = validateAutomationStudioTrialEvidenceResult(input);
    expect(answer.ok).toBe(true);
    if (answer.ok) {
      answer.result.assertionsChecked[0]!.outcome = "violated";
      expect(input.assertionsChecked[0]!.outcome).toBe("satisfied");
    }
  });

  it.each([null, 7, "pass", []])("refuses a non-object %p", (input) => {
    expect(codes(input)).toContain("trial_evidence.not_object");
  });

  it("refuses empty or unknown origins", () => {
    expect(codes(recordedPass({ evidenceOrigins: [] }))).toContain("trial_evidence.origins_empty");
    expect(codes({ ...recordedPass(), evidenceOrigins: ["recorded", "guessed"] })).toContain("trial_evidence.origin_unknown");
  });

  it("refuses unknown verdicts and scopes", () => {
    expect(codes({ ...recordedPass(), verdict: "ok" })).toContain("trial_evidence.verdict_unknown");
    expect(codes({ ...recordedPass(), scope: "everything" })).toContain("trial_evidence.scope_unknown");
  });

  it("refuses a pass that carries missing evidence", () => {
    const gap = { reasonCode: "missing_artifact" as const, scope: "segment" as const, operation: "read rows", detail: "capture absent" };
    expect(codes(recordedPass({ missingEvidence: [gap], reasonCodes: ["missing_artifact"] }))).toContain("trial_evidence.pass_with_missing_evidence");
  });

  it("refuses a pass with reason codes", () => {
    expect(codes(recordedPass({ reasonCodes: ["assertion_failure"] }))).toContain("trial_evidence.pass_with_reasons");
  });

  it("T18: refuses a pass whose goal assertions are unverified, violated or absent", () => {
    expect(codes(recordedPass({ assertionsChecked: [{ id: "output-matches-goal", outcome: "unverified" }] }))).toContain("trial_evidence.pass_with_unsatisfied_assertion");
    expect(codes(recordedPass({ assertionsChecked: [{ id: "output-matches-goal", outcome: "violated" }] }))).toContain("trial_evidence.pass_with_unsatisfied_assertion");
    expect(codes(recordedPass({ assertionsChecked: [] }))).toContain("trial_evidence.pass_without_assertions");
  });

  it("T18: a recorded success notice with the wrong output is inconclusive or a fail, both valid", () => {
    const unverified = recordedPass({
      verdict: "inconclusive",
      assertionsChecked: [{ id: "output-matches-goal", outcome: "unverified" }],
      reasonCodes: ["missing_artifact"],
      missingEvidence: [{ reasonCode: "missing_artifact", scope: "full_recorded_path", operation: null, detail: "outcome evidence was not captured" }]
    });
    const failed = recordedPass({ verdict: "fail", assertionsChecked: [{ id: "output-matches-goal", outcome: "violated" }], reasonCodes: ["assertion_failure"] });
    expect(validateAutomationStudioTrialEvidenceResult(unverified).ok).toBe(true);
    expect(validateAutomationStudioTrialEvidenceResult(failed).ok).toBe(true);
  });

  it("refuses an inconclusive result without a reason or without missing evidence", () => {
    const gap = { reasonCode: "incomplete_capture" as const, scope: "segment" as const, operation: null, detail: "trace ended early" };
    expect(codes(recordedPass({ verdict: "inconclusive", reasonCodes: [], missingEvidence: [gap] }))).toContain("trial_evidence.inconclusive_without_reason");
    expect(codes(recordedPass({ verdict: "inconclusive", reasonCodes: ["incomplete_capture"], missingEvidence: [] }))).toContain("trial_evidence.inconclusive_without_missing_evidence");
  });

  it("refuses a missing-evidence entry whose reason is not among the result's reasons", () => {
    const gap = { reasonCode: "incomplete_capture" as const, scope: "segment" as const, operation: null, detail: "trace ended early" };
    expect(codes(recordedPass({ verdict: "inconclusive", reasonCodes: ["stale_checkpoint"], missingEvidence: [gap] }))).toContain("trial_evidence.gap_reason_not_listed");
  });

  it("refuses a fail without a reason", () => {
    expect(codes(recordedPass({ verdict: "fail", reasonCodes: [] }))).toContain("trial_evidence.fail_without_reason");
  });

  it("refuses unknown reason codes, in the result and in its gaps", () => {
    expect(codes({ ...recordedPass(), verdict: "fail", reasonCodes: ["felt_wrong"] })).toContain("trial_evidence.reason_unknown");
    const gap = { reasonCode: "felt_wrong", scope: "segment", operation: null, detail: "x" };
    expect(codes({ ...recordedPass(), verdict: "inconclusive", reasonCodes: ["incomplete_capture"], missingEvidence: [gap] })).toContain("trial_evidence.reason_unknown");
  });

  it("keeps the reason vocabulary closed", () => {
    expect(Object.isFrozen(AUTOMATION_STUDIO_TRIAL_EVIDENCE_REASON_CODES)).toBe(true);
    expect(AUTOMATION_STUDIO_TRIAL_EVIDENCE_REASON_CODES).toContain("offline_not_allowed_in_phase");
  });

  it("refuses a live origin mixed into a recorded result without a live episode", () => {
    expect(codes(recordedPass({ evidenceOrigins: ["recorded", "live"] }))).toContain("trial_evidence.live_without_episode");
    expect(codes(recordedPass({ evidenceOrigins: ["recorded", "live"], scope: "segment" }))).toContain("trial_evidence.live_without_episode");
  });

  it("accepts a recorded result mixed with a focused live segment that names its episode", () => {
    expect(validateAutomationStudioTrialEvidenceResult(recordedPass({ evidenceOrigins: ["recorded", "live"], scope: "segment", liveEpisodeId: "run-live-2" })).ok).toBe(true);
  });

  it("refuses a live episode on a result with no live origin", () => {
    expect(codes(recordedPass({ liveEpisodeId: "run-live-2" }))).toContain("trial_evidence.episode_without_live");
  });

  it("refuses a full live run that is not exactly live, or names no episode", () => {
    expect(codes(livePass("run-live-9", { evidenceOrigins: ["live", "recorded"], sourceEpisodeIds: ["run-live-1"] }))).toContain("trial_evidence.full_live_run_not_live_only");
    expect(codes(recordedPass({ scope: "full_live_run" }))).toContain("trial_evidence.full_live_run_not_live_only");
    expect(codes(livePass("run-live-9", { liveEpisodeId: null }))).toContain("trial_evidence.live_without_episode");
  });

  it("refuses recorded evidence that names no source episode", () => {
    expect(codes(recordedPass({ sourceEpisodeIds: [] }))).toContain("trial_evidence.recorded_without_source_episode");
  });

  it("refuses a full recorded path without recorded evidence", () => {
    expect(codes(recordedPass({ evidenceOrigins: ["pure_computation"], sourceEpisodeIds: [] }))).toContain("trial_evidence.full_recorded_path_not_recorded");
  });

  it("refuses malformed identity fields", () => {
    expect(codes({ ...recordedPass(), candidateRevision: -1 })).toContain("trial_evidence.candidate_revision_invalid");
    expect(codes({ ...recordedPass(), candidateDigest: "" })).toContain("trial_evidence.text_invalid");
    expect(codes({ ...recordedPass(), goalContractVersion: 2 })).toContain("trial_evidence.text_invalid");
    expect(codes({ ...recordedPass(), provenance: "trusted" })).toContain("trial_evidence.provenance_unknown");
  });
});
