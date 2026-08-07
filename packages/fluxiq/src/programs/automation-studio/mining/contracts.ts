import type { JsonObject } from "../../../core/index.ts";
import type { EvidenceReference } from "../model/index.ts";
import type { StateElementDescriptor, StateElementKind } from "../model/index.ts";
import type { NormalizedTimeline } from "../normalization/index.ts";

export type EvidenceFactKind =
  | "action"
  | "domain_event"
  | "state_delta"
  | "state_checkpoint"
  | "observation"
  | "note"
  | "marker";

export type EvidenceFact = {
  schemaVersion: "0.1";
  factId: string;
  miningRunId: string;
  recordingId: string;
  normalizedTimelineId: string;
  kind: EvidenceFactKind;
  title: string;
  summary: string;
  occurredAt: number;
  offsetMs: number;
  source: EvidenceReference;
  domain?: {
    domainId: string;
    eventType?: string;
    label?: string;
  };
  data?: JsonObject;
  metadata?: JsonObject;
};

export type EvidenceObservationKind =
  | "action_performed"
  | "domain_event_observed"
  | "state_changed"
  | "state_recorded"
  | "condition_observed"
  | "note_added"
  | "marker_added";

export type EvidenceObservation = {
  schemaVersion: "0.1";
  observationId: string;
  miningRunId: string;
  recordingId: string;
  normalizedTimelineId: string;
  kind: EvidenceObservationKind;
  title: string;
  summary: string;
  factIds: string[];
  subject?: {
    type: string;
    label?: string;
    statePath?: string;
    eventType?: string;
    outputId?: string;
    confirmationInputId?: string;
    confirmationTimeoutMs?: number;
    parameters?: JsonObject;
    target?: JsonObject;
  };
  before?: JsonObject;
  after?: JsonObject;
  metadata?: JsonObject;
};

export type EvidenceClaimType =
  | "action_effect"
  | "candidate_condition"
  | "wait"
  | "transition"
  | "success_signal"
  | "open_question";

export type EvidenceClaimConfidence = {
  score: number;
  basis: string;
  sampleSize?: number;
  metadata?: JsonObject;
};

export type EvidenceClaim = {
  schemaVersion: "0.1";
  claimId: string;
  miningRunId: string;
  recordingId: string;
  normalizedTimelineId: string;
  claimType: EvidenceClaimType;
  title: string;
  summary: string;
  observationIds: string[];
  factIds: string[];
  statement: {
    subject: JsonObject;
    relationship: string;
    object?: JsonObject;
  };
  confidence: EvidenceClaimConfidence;
  sourceEvidence: EvidenceReference[];
  metadata?: JsonObject;
};

export type StateActionCorrelationRelation =
  | "present_before_action"
  | "stable_before_action"
  | "changed_after_action"
  | "appeared_after_action"
  | "disappeared_after_action"
  | "became_enabled_before_action"
  | "became_visible_after_action"
  | "changed_between_actions";

export type StateActionCorrelation = {
  schemaVersion: "0.1";
  correlationId: string;
  miningRunId: string;
  recordingId: string;
  normalizedTimelineId: string;
  actionEntryId: string;
  statePath: string;
  relation: StateActionCorrelationRelation;
  elementKind: StateElementKind;
  descriptor?: StateElementDescriptor;
  before?: JsonObject;
  after?: JsonObject;
  timing: {
    beforeMs?: number;
    afterMs?: number;
    windowStartOffsetMs: number;
    actionOffsetMs: number;
    windowEndOffsetMs: number;
  };
  support: EvidenceReference[];
  metadata?: JsonObject;
};

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
  evidenceFactIds?: string[];
  evidenceObservationIds?: string[];
  stateActionCorrelationIds?: string[];
  evidenceClaimIds?: string[];
  facts?: EvidenceFact[];
  observations?: EvidenceObservation[];
  correlations?: StateActionCorrelation[];
  claims?: EvidenceClaim[];
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
