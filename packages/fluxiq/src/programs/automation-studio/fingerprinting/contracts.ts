import type { JsonObject } from "../../../core";
import type { PolicyGraph, PolicyNode, StateSnapshot } from "../model";

export type SignalContribution = {
  signalPath: string;
  score: number;
  weight: number;
  reason: string;
  metadata?: JsonObject;
};

export type FingerprintCandidateScore = {
  nodeId: string;
  totalScore: number;
  normalizedScore: number;
  matchedRequired: string[];
  failedRequired: string[];
  positiveContributions: SignalContribution[];
  negativeContributions: SignalContribution[];
  confidence: number;
  metadata?: JsonObject;
};

export type FingerprintScoringContext = {
  previousNodeId?: string;
  recentFailureNodeIds?: string[];
  metadata?: JsonObject;
};

export type FingerprintScorer = {
  scoreNode(node: PolicyNode, state: StateSnapshot, context?: FingerprintScoringContext): FingerprintCandidateScore;
  scorePolicy(policy: PolicyGraph, state: StateSnapshot, context?: FingerprintScoringContext): FingerprintCandidateScore[];
};
