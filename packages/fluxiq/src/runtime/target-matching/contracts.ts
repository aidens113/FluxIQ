import type { JsonObject } from "../../core/index.ts";
import type { TargetBounds, TargetMatchingSnapshot } from "./state-evidence.ts";

export type ElementFingerprint = {
  /** Additional domain signals are opaque to the neutral matcher. */
  [signal: string]: unknown;
  visibleText?: string;
  accessibleName?: string;
  label?: string;
  id?: string;
  testId?: string;
  automationId?: string;
  entityId?: string;
  entityKind?: string;
  role?: string;
  queryPath?: string;
  statePath?: string | { namespace: string; path: string };
  bounds?: TargetBounds;
  metadata?: JsonObject;
};

export type ElementFingerprintCandidate<TFingerprint extends ElementFingerprint = ElementFingerprint> = TFingerprint & {
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

export type ElementFingerprintScore<TFingerprint extends ElementFingerprint = ElementFingerprint> = {
  candidateId: string;
  totalScore: number;
  normalizedScore: number;
  confidence: number;
  matchedSignals: string[];
  failedSignals: string[];
  positiveContributions: ElementFingerprintContribution[];
  negativeContributions: ElementFingerprintContribution[];
  candidate: ElementFingerprintCandidate<TFingerprint>;
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
  entityKind: number;
  queryPath: number;
  bounds: number;
  visibility: number;
};

export type ElementFingerprintScoringOptions<TWeights extends Record<string, number> = ElementFingerprintWeights> = {
  weights?: Partial<TWeights>;
  minimumNormalizedScore?: number;
  metadata?: JsonObject;
};

export type ElementMatcher<TFingerprint extends ElementFingerprint = ElementFingerprint, TWeights extends Record<string, number> = Record<string, number>> = {
  readonly weights: TWeights;
  scoreCandidate(fingerprint: TFingerprint, candidate: ElementFingerprintCandidate<TFingerprint>, options?: ElementFingerprintScoringOptions<TWeights>): ElementFingerprintScore<TFingerprint>;
  scoreCandidates(fingerprint: TFingerprint, candidates: ElementFingerprintCandidate<TFingerprint>[], options?: ElementFingerprintScoringOptions<TWeights>): ElementFingerprintScore<TFingerprint>[];
  bestCandidate(fingerprint: TFingerprint, candidates: ElementFingerprintCandidate<TFingerprint>[], options?: ElementFingerprintScoringOptions<TWeights>): ElementFingerprintScore<TFingerprint> | null;
  candidatesFromStateSnapshot(snapshot: TargetMatchingSnapshot, options?: { includeHidden?: boolean }): ElementFingerprintCandidate<TFingerprint>[];
};
