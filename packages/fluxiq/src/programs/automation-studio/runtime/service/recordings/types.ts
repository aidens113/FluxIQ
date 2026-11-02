import type { LearnedTaskModel } from "../../../learning/index.ts";
import type { EvidenceClaim, EvidenceFact, EvidenceObservation, SignalMiningResult, StateActionCorrelation } from "../../../mining/index.ts";
import type { PolicyProposalArtifact } from "../../policy-model.ts";
import type { RecordingFlowProposalArtifact } from "../../recording-flow-proposal.ts";
import type { RecordingNormalizationReviewContent } from "../../../../../runtime/recording/mapping/index.ts";

// The review a normalization pass leaves beside a recording: how each raw
// entry survived into the normalized timeline, and the waits between them.
export type NormalizationReviewArtifact = RecordingNormalizationReviewContent & {
  schemaVersion: "0.1";
  reviewId: string;
  generatedAt: number;
};

export type ReplayResultArtifact = {
  schemaVersion: "0.1";
  replayId: string;
  recordingId: string;
  policyId: string;
  status: "matched" | "partial" | "failed";
  matchedActions: number;
  expectedActions: number;
  missingActions: string[];
  unexpectedActions: string[];
  timingWarnings: string[];
  generatedAt: number;
};

export type AutomationPipelineArtifacts = {
  normalizationReviews: NormalizationReviewArtifact[];
  miningRuns: SignalMiningResult[];
  evidenceFacts: EvidenceFact[];
  evidenceObservations: EvidenceObservation[];
  stateActionCorrelations: StateActionCorrelation[];
  evidenceClaims: EvidenceClaim[];
  learnedTaskModels: LearnedTaskModel[];
  policyProposals: PolicyProposalArtifact[];
  recordingFlowProposals: RecordingFlowProposalArtifact[];
  replayResults: ReplayResultArtifact[];
};
