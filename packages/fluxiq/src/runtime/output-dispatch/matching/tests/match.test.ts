import { expect, it } from "vitest";
import { createElementMatcher, type ElementMatcher } from "../../../target-matching/index.ts";
import { matchOutputTarget, outputTargetMinimumConfidence } from "../../index.ts";
it("keeps no-candidate and no-matcher states separate without claiming a floor", () => {
  const empty = matchOutputTarget({ entityId: "wanted" }, [], 0.9, undefined);
  expect(empty).toMatchObject({ ok: true, resolution: { status: "unresolved_no_candidates", candidateCount: 0 } });
  const delegated = matchOutputTarget({ entityId: "wanted" }, [{ candidateId: "candidate", entityId: "wanted" }], 0.9, undefined);
  expect(delegated).toMatchObject({ ok: true, resolution: { status: "unresolved_no_matcher", candidateCount: 1 } });
  for (const result of [empty, delegated]) {
    expect(result.resolution).not.toHaveProperty("minimumConfidence");
    expect(result.resolution).not.toHaveProperty("confidence");
  }
});
it("retains exact score diagnostics and failure boundaries without exposing domain candidates or contribution metadata", () => {
  const base = createElementMatcher();
  const fingerprint = { entityId: "wanted" };
  const candidates = [{ candidateId: "candidate", entityId: "wanted", metadata: { private: "PRIVATE_CANDIDATE" } }];
  const score = { ...base.scoreCandidate(fingerprint, candidates[0]!), confidence: 0.7, normalizedScore: 0.6, totalScore: 17, matchedSignals: ["entityId"], failedSignals: ["label"], positiveContributions: [{ signalPath: "entityId", score: 1, weight: 17, reason: "matched", metadata: { private: "PRIVATE_CONTRIBUTION" } }] };
  const matcher: ElementMatcher = { ...base, bestCandidate: () => score };
  const rejected = matchOutputTarget(fingerprint, candidates, 0.8, matcher);
  expect(rejected).toMatchObject({ ok: false, error: "Element target match confidence 70% is below the required 80%.", failure: { category: "target_not_found", code: "element_target.below_confidence", retryable: true, stage: "target_resolution", expected: "best candidate confidence of at least 80%", actual: "best candidate confidence 70%" }, resolution: { status: "below_confidence", candidateCount: 1, candidateId: "candidate", confidence: 0.7, normalizedScore: 0.6, minimumConfidence: 0.8 } });
  const matched = matchOutputTarget(fingerprint, candidates, 0.7, matcher);
  expect(matched).toMatchObject({ ok: true, selectedCandidate: { candidateId: "candidate", confidence: 0.7, matchedSignals: ["entityId"], failedSignals: ["label"], metadata: { totalScore: 17, normalizedScore: 0.6 } }, diagnostics: { status: "matched", candidateId: "candidate", confidence: 0.7, normalizedScore: 0.6 } });
  expect(JSON.stringify([rejected, matched])).not.toContain("PRIVATE_");
  expect(matchOutputTarget(fingerprint, candidates, 0.7, { ...matcher, bestCandidate: () => null })).toMatchObject({ ok: false, error: "Element target could not be matched to any runtime candidate.", failure: { code: "element_target.no_match" }, resolution: { status: "no_match", candidateCount: 1, minimumConfidence: 0.7 } });
});
it("preserves finite override clamping and each registered safety default", () => {
  for (const [level, expected] of [["destructive", 0.9], ["privileged", 0.82], ["review", 0.68], ["safe", 0.45], [undefined, 0.5]] as const) {
    expect(outputTargetMinimumConfidence(undefined, level)).toBe(expected);
    expect(outputTargetMinimumConfidence(NaN, level)).toBe(expected);
    expect(outputTargetMinimumConfidence(Infinity, level)).toBe(expected);
    expect(outputTargetMinimumConfidence(0.67, level)).toBe(0.67);
    expect(outputTargetMinimumConfidence(-1, level)).toBe(0);
    expect(outputTargetMinimumConfidence(2, level)).toBe(1);
  }
});
