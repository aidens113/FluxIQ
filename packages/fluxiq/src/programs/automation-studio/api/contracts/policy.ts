import type { DynamicPolicyArtifact } from "../../types.ts";
import type { RecordingProjectRequest } from "./recording.ts";

export type GeneratePolicyRequest = {
  taskId: string;
  domainId?: string | null;
  recordingIds?: string[];
};

export type GeneratePolicyResponse = {
  policy: DynamicPolicyArtifact;
  warnings: string[];
};

export type LearnTaskModelRequest = RecordingProjectRequest & {
  taskId?: string;
  miningRunId?: string;
};

export type ProposePolicyFromModelRequest = RecordingProjectRequest & {
  learnedTaskModelId?: string;
  miningRunId?: string;
  recordingId?: string;
};

export type ApprovePolicyProposalRequest = RecordingProjectRequest & {
  proposalId: string;
  targetFlowId?: string;
  requireExistingFlow?: boolean;
  /** @deprecated Compatibility alias; new callers target canonical Flows. */
  targetTaskId?: string;
  policyOverride?: unknown;
  requireExistingTask?: boolean;
};

export type ReplayPolicyAgainstRecordingRequest = RecordingProjectRequest & {
  recordingId: string;
  policyId?: string;
};
