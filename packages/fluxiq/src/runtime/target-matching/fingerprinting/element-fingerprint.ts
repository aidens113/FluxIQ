import type { JsonObject } from "../../../core/index.ts";
import type { TargetBounds as StateBounds, TargetMatchingSnapshot as StateSnapshot, ElementMatcher } from "../index.ts";
import { createElementMatcher, scoreElementFingerprintCandidate as scoreNeutralCandidate, scoreElementFingerprintCandidates as scoreNeutralCandidates, bestElementFingerprintCandidate as bestNeutralCandidate, DEFAULT_ELEMENT_FINGERPRINT_WEIGHTS as NEUTRAL_WEIGHTS, candidatesFromStateSnapshot as neutralCandidates } from "../index.ts";
export { aggregateElementFingerprintScore, createElementMatcher } from "../index.ts";
export type { ElementMatcher, TargetBounds, TargetMatchingSnapshot, TargetStateValue, TargetVisualLayer } from "../index.ts";

/** Legacy browser fields round-trip as opaque data; web scoring requires a domain matcher. */
export type ElementFingerprint = {
  visibleText?: string;
  accessibleName?: string;
  label?: string;
  id?: string;
  testId?: string;
  automationId?: string;
  entityId?: string;
  entityKind?: string;
  tagName?: string;
  role?: string;
  selector?: string;
  xpath?: string;
  queryPath?: string;
  statePath?: string | { namespace: string; path: string };
  url?: string;
  classNames?: string[];
  bounds?: StateBounds;
  attributes?: Record<string, string>;
  metadata?: JsonObject;
};

export type ElementFingerprintCandidate = ElementFingerprint & {
  candidateId: string;
  visualFrameId?: string;
  visualLayerId?: string;
  isVisibleOnViewport?: boolean;
};

export type ElementFingerprintContribution = {
  signalPath: string;
  score: number;
  weight: number;
  reason: string;
  metadata?: JsonObject;
};

export type ElementFingerprintScore = {
  candidateId: string;
  totalScore: number;
  normalizedScore: number;
  confidence: number;
  matchedSignals: string[];
  failedSignals: string[];
  positiveContributions: ElementFingerprintContribution[];
  negativeContributions: ElementFingerprintContribution[];
  candidate: ElementFingerprintCandidate;
  metadata?: JsonObject;
};

export type ElementFingerprintWeights = {
  visibleText: number;
  accessibleName: number;
  label: number;
  id: number;
  testId: number;
  automationId: number;
  entityId: number;
  statePath: number;
  role: number;
  tagName: number;
  entityKind: number;
  selector: number;
  queryPath: number;
  xpath: number;
  url: number;
  classNames: number;
  bounds: number;
  attributes: number;
  visibility: number;
};

export type ElementFingerprintScoringOptions = {
  weights?: Partial<ElementFingerprintWeights>;
  minimumNormalizedScore?: number;
  metadata?: JsonObject;
};

export type AutomationStudioElementMatcher = {
  readonly weights: ElementFingerprintWeights;
  scoreCandidate(fingerprint: ElementFingerprint, candidate: ElementFingerprintCandidate, options?: ElementFingerprintScoringOptions): ElementFingerprintScore;
  scoreCandidates(fingerprint: ElementFingerprint, candidates: ElementFingerprintCandidate[], options?: ElementFingerprintScoringOptions): ElementFingerprintScore[];
  bestCandidate(fingerprint: ElementFingerprint, candidates: ElementFingerprintCandidate[], options?: ElementFingerprintScoringOptions): ElementFingerprintScore | null;
  candidatesFromStateSnapshot(snapshot: StateSnapshot, options?: { includeHidden?: boolean }): ElementFingerprintCandidate[];
};

/** @deprecated Browser weights have no effect in Core. Use an explicit domain matcher. */
export const DEFAULT_ELEMENT_FINGERPRINT_WEIGHTS: ElementFingerprintWeights = { ...NEUTRAL_WEIGHTS, tagName: 0, selector: 0, xpath: 0, url: 0, classNames: 0, attributes: 0 };
export function createAutomationStudioElementMatcher(options: { weights?: Partial<ElementFingerprintWeights> } = {}): AutomationStudioElementMatcher {
  const matcher = createElementMatcher(options);
  return { ...matcher, weights: { ...DEFAULT_ELEMENT_FINGERPRINT_WEIGHTS, ...matcher.weights } } as AutomationStudioElementMatcher;
}
export function scoreElementFingerprintCandidate(fingerprint: ElementFingerprint, candidate: ElementFingerprintCandidate, options: ElementFingerprintScoringOptions = {}): ElementFingerprintScore { return scoreNeutralCandidate(fingerprint, candidate, options) as ElementFingerprintScore; }
export function scoreElementFingerprintCandidates(fingerprint: ElementFingerprint, candidates: ElementFingerprintCandidate[], options: ElementFingerprintScoringOptions = {}): ElementFingerprintScore[] { return scoreNeutralCandidates(fingerprint, candidates, options) as ElementFingerprintScore[]; }
export function bestElementFingerprintCandidate(fingerprint: ElementFingerprint, candidates: ElementFingerprintCandidate[], options: ElementFingerprintScoringOptions = {}): ElementFingerprintScore | null { return bestNeutralCandidate(fingerprint, candidates, options) as ElementFingerprintScore | null; }
export function candidatesFromStateSnapshot(snapshot: StateSnapshot, options: { includeHidden?: boolean } = {}): ElementFingerprintCandidate[] { return neutralCandidates(snapshot, options) as ElementFingerprintCandidate[]; }
