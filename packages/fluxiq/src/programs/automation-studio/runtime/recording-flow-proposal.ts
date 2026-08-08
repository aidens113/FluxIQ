import type { JsonObject } from "../../../core/index.ts";
import type { AutomationStudioNodeDefinition } from "../nodes/index.ts";

export type RecordingProposalEvidenceReference = {
  layer: "recording" | "normalized_timeline" | "evidence";
  artifactId: string;
  entryId?: string;
  observationId?: string;
};

export type RecordingFlowActionCandidate = {
  candidateId: string;
  sourceObservationIds: string[];
  sourceInputIds: string[];
  outputId: string;
  parameters: JsonObject;
  expectedConfirmation?: { inputId: string; timeoutMs?: number; description?: string };
  confidence: number;
  evidence: RecordingProposalEvidenceReference[];
  /** Action-mapped input events remain observable confirmation, never policy state. */
  policyStateEligible: false;
  label?: string;
  description?: string;
};

export type RecordingFlowProposalDestination =
  | { kind: "flow"; flowId: string; created: boolean }
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

export function recordingProposalDefinitionId(proposalId: string, candidateId: string): string {
  return `recording.${safeId(proposalId)}.${safeId(candidateId)}`;
}

function safeId(value: string): string {
  return value.trim().replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "item";
}
