import type { JsonObject } from "../../../core";
import type { EvidenceReference } from "../model";
import type { NormalizedTimeline } from "../normalization";

export type MiningWindowKind = "pre_action" | "immediate_post_action" | "delayed_post_action" | "stable_result" | "baseline";

export type MiningWindow = {
  id: string;
  kind: MiningWindowKind;
  actionEntryId?: string;
  startOffsetMs: number;
  endOffsetMs: number;
  sourceEvidence: EvidenceReference[];
  metadata?: JsonObject;
};

export type ActionEffectRelationship =
  | "likely_effect"
  | "possible_effect"
  | "correlated"
  | "background_change"
  | "uncertain";

export type ActionEffectCandidate = {
  actionOccurrenceId: string;
  signalPath: string;
  relationship: ActionEffectRelationship;
  probability: number;
  delayMs: {
    min: number;
    median: number;
    max: number;
  };
  persistenceMs?: number;
  evidence: EvidenceReference[];
  metadata?: JsonObject;
};

export type LearnedConditionRole =
  | "hard_requirement"
  | "eligibility_signal"
  | "preference_signal"
  | "context_signal"
  | "negative_requirement";

export type LearnedConditionCandidate = {
  signalPath: string;
  role: LearnedConditionRole;
  probability: number;
  evidence: EvidenceReference[];
  metadata?: JsonObject;
};

export type SignalMiningResult = {
  schemaVersion: "0.1";
  miningRunId: string;
  normalizedTimelineId: string;
  windows: MiningWindow[];
  actionEffects: ActionEffectCandidate[];
  conditionCandidates: LearnedConditionCandidate[];
  issues: string[];
  generatedAt: number;
  metadata?: JsonObject;
};

export type SignalMiner = {
  mine(timeline: NormalizedTimeline): Promise<SignalMiningResult> | SignalMiningResult;
};
