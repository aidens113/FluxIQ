import type { AutomationStudioBootstrapAccounting } from "../../flow-bootstrap/index.ts";
import type { AutomationStudioFlowCandidate, AutomationStudioCandidateOriginalSourceBinding, AutomationStudioCandidateOriginalSources } from "../../flow-bootstrap/candidate/index.ts";

/** A durable unverified submission, deliberately outside the adaptation store. */
type Draft = {
  kind: "flow_candidate_draft";
  status: "draft";
  verification: "not_performed";
  candidateId: string;
  projectId: string;
  flowId: string;
  sourceInstructionIds: string[];
  instructionText: string;
  baseSettingsRevision: number;
  candidate: AutomationStudioFlowCandidate;
  accounting: AutomationStudioBootstrapAccounting;
  createdAt: number;
};
export type AutomationStudioFlowCandidateDraftRecord = Draft & (
  | { schemaVersion: 1; originalSources?: never; originalInstructionsDigest?: never }
  | { schemaVersion: 2; originalSources: AutomationStudioCandidateOriginalSources; originalInstructionsDigest: string;
      candidate: AutomationStudioFlowCandidate & { fingerprintVersion: "candidate.plan+original_sources.v2"; originalInstructionsDigest: string } }
);
export type AutomationStudioCandidateDraftReference = {
  projectId: string; flowId: string; candidateId: string; revision: number; digest: string;
  baseDependencyDigest: string; baseSettingsRevision: number; originalInstructionsDigest: string;
};
export type AutomationStudioCandidateDraftSourceRead =
  | { status: "bound"; record: Extract<AutomationStudioFlowCandidateDraftRecord, { schemaVersion: 2 }>; originalInstructionsDigest: string }
  | { status: "unknown"; code: string };
export type AutomationStudioCandidateOriginalSourceOutcome =
  | { status: "bound"; binding: AutomationStudioCandidateOriginalSourceBinding }
  | { status: "unknown"; code: string };
