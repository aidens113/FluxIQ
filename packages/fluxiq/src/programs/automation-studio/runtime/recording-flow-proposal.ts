import type { JsonObject } from "../../../core/index.ts";
import type { AutomationStudioNodeDefinition } from "../nodes/index.ts";

export type { RecordingProposalEvidenceReference, RecordingFlowActionCandidate } from "../../../components/automation/importer/recording-mapper/index.ts";
import type { RecordingFlowActionCandidate } from "../../../components/automation/importer/recording-mapper/index.ts";

export type RecordingFlowProposalDestination =
  | { kind: "flow"; flowId: string; created: boolean; writeMode?: "append" | "replace_recording_derived" }
  | { kind: "node"; visibility: "private" | "public"; definitionIds: string[] };

export type RecordingFlowProposalReview = {
  decision: "approved" | "rejected";
  reviewedAt: number;
  reviewerId?: string;
  notes?: string;
  destination?: RecordingFlowProposalDestination;
};

export type RecordingFlowProposalArtifact = {
  schemaVersion: "0.1";
  proposalId: string;
  projectId: string;
  recordingId: string;
  domainId: string | null;
  mapper: { id: string; version: string; packageId: string; packageVersion: string };
  status: "proposed" | "approved" | "rejected" | "invalidated";
  candidates: RecordingFlowActionCandidate[];
  review?: RecordingFlowProposalReview;
  approvedDefinitions?: AutomationStudioNodeDefinition[];
  invalidation?: { invalidatedAt: number; reasons: string[]; affectedFlowIds: string[] };
  generatedAt: number;
  updatedAt: number;
  metadata?: JsonObject;
};

export { recordingProposalDefinitionId } from "../../../components/automation/recording/index.ts";
