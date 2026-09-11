import type { NormalizedTimeline } from "../../../normalization/index.ts";
import type { SignalMiningResult } from "../../../mining/index.ts";
import type { PolicyProposalArtifact } from "../../policy-model.ts";
import type { RecordingFlowProposalArtifact } from "../../recording-flow-proposal.ts";
import type { NormalizationReviewArtifact } from "../recordings/index.ts";

// What the recording pipeline hands back: everything one finalized recording
// produced, and the proposal generation request and result written over it.

export type ProcessFinalizedRecordingResult = {
  schemaVersion: "0.1";
  recordingId: string;
  status: "processed" | "skipped" | "partial";
  normalizedTimeline?: NormalizedTimeline;
  review?: NormalizationReviewArtifact;
  miningRun?: SignalMiningResult;
  proposal?: PolicyProposalArtifact;
  recordingFlowProposals?: RecordingFlowProposalArtifact[];
  issues: string[];
  generatedAt: number;
};

export type GenerateRecordingProposalInput = {
  projectId: string;
  recordingId: string;
  mode: "direct" | "llm_assisted";
  title?: string;
  instructions?: string;
  constraints?: string;
  replaceProposalId?: string;
};

export type GenerateRecordingProposalResult = {
  schemaVersion: "0.1";
  recordingId: string;
  mode: "direct" | "llm_assisted";
  status: "processed" | "skipped" | "partial";
  proposal?: PolicyProposalArtifact;
  recordingFlowProposals?: RecordingFlowProposalArtifact[];
  issues: string[];
  generatedAt: number;
};

export type CreateRecordingFlowProposalsResult = {
  proposals: RecordingFlowProposalArtifact[];
  issues: string[];
};
