import type { JsonObject } from "../../core/index.ts";
import type { ElementFingerprint, ElementFingerprintCandidate, ElementFingerprintContribution, ElementFingerprintScore } from "./contracts.ts";

/** Aggregate adapter measurements using the shared normalized score and confidence contract. */
export function aggregateElementFingerprintScore<TFingerprint extends ElementFingerprint>(
  candidate: ElementFingerprintCandidate<TFingerprint>,
  positiveContributions: ElementFingerprintContribution[],
  negativeContributions: ElementFingerprintContribution[],
  matchedSignals: string[],
  failedSignals: string[],
  possibleScore: number,
  metadata?: JsonObject
): ElementFingerprintScore<TFingerprint> {
  const totalScore = round([...positiveContributions, ...negativeContributions].reduce((sum, item) => sum + item.score, 0));
  const normalizedScore = possibleScore > 0 ? clamp(round(totalScore / possibleScore), -1, 1) : 0;
  const strongMatches = matchedSignals.filter((signal) => ["visibleText", "accessibleName", "label", "id", "testId", "automationId", "entityId", "statePath"].includes(signal)).length;
  const confidence = clamp(round(Math.max(0, normalizedScore) * (0.82 + Math.min(strongMatches, 3) * 0.06)), 0, 1);
  return { candidateId: candidate.candidateId, totalScore, normalizedScore, confidence, matchedSignals, failedSignals, positiveContributions, negativeContributions, candidate, ...(metadata ? { metadata } : {}) };
}
function clamp(value: number, min: number, max: number): number { return Math.min(max, Math.max(min, value)); }
function round(value: number): number { return Math.round(value * 1_000) / 1_000; }
