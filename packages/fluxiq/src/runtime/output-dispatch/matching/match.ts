import { outputDispatchFailure } from "../results/index.ts";
import type { ElementFingerprint, ElementFingerprintCandidate, ElementMatcher } from "../../target-matching/index.ts";
import type { OutputTargetMatchResult } from "./result.ts";
export function matchOutputTarget(fingerprint: ElementFingerprint, candidates: ElementFingerprintCandidate[] | undefined, minimumConfidence: number, elementMatcher: ElementMatcher | undefined): OutputTargetMatchResult {
  if (!candidates?.length) {
    // Nothing to score against, so no floor was applied, and the trace must not name one as if it had been.
    return {
      ok: true,
      diagnostics: { status: "unresolved_no_candidates", reason: "No runtime element candidates were supplied, so Core applied no confidence floor and left resolving the element to the output adapter." },
      resolution: { status: "unresolved_no_candidates", candidateCount: 0 }
    };
  }
  const candidateCount = candidates.length;
  if (!elementMatcher) {
    return {
      ok: true,
      diagnostics: { status: "unresolved_no_matcher", reason: "No domain matcher was supplied, so Core left target resolution and confidence measurement to the output adapter." },
      resolution: { status: "unresolved_no_matcher", candidateCount }
    };
  }
  const best = elementMatcher.bestCandidate(fingerprint, candidates);
  if (!best) {
    return {
      ok: false,
      error: "Element target could not be matched to any runtime candidate.",
      failure: outputDispatchFailure("target_not_found", "element_target.no_match", true, "target_resolution"),
      resolution: { status: "no_match", candidateCount, minimumConfidence }
    };
  }
  const scored = {
    candidateId: best.candidateId,
    confidence: best.confidence,
    normalizedScore: best.normalizedScore,
    matchedSignals: best.matchedSignals,
    failedSignals: best.failedSignals
  };
  if (best.confidence < minimumConfidence) {
    const measured = Math.round(best.confidence * 100);
    const required = Math.round(minimumConfidence * 100);
    return {
      ok: false,
      error: `Element target match confidence ${measured}% is below the required ${required}%.`,
      failure: {
        ...outputDispatchFailure("target_not_found", "element_target.below_confidence", true, "target_resolution"),
        expected: `best candidate confidence of at least ${required}%`,
        actual: `best candidate confidence ${measured}%`
      },
      resolution: { status: "below_confidence", candidateCount, minimumConfidence, ...scored }
    };
  }
  const selectedCandidate = {
    candidateId: best.candidateId,
    confidence: best.confidence,
    matchedSignals: best.matchedSignals,
    failedSignals: best.failedSignals,
    metadata: { totalScore: best.totalScore, normalizedScore: best.normalizedScore }
  };
  return {
    ok: true,
    selectedCandidate,
    diagnostics: {
      status: "matched",
      candidateId: best.candidateId,
      confidence: best.confidence,
      matchedSignals: best.matchedSignals,
      failedSignals: best.failedSignals,
      normalizedScore: best.normalizedScore
    },
    resolution: { status: "matched", candidateCount, minimumConfidence, ...scored }
  };
}
