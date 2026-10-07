import type { AutomationStudioBootstrapAccounting, AutomationStudioFlowCandidate } from "../../flow-bootstrap/index.ts";

/** A durable unverified submission, deliberately outside the adaptation store. */
export type AutomationStudioFlowCandidateDraftRecord = {
  kind: "flow_candidate_draft";
  schemaVersion: 1;
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
