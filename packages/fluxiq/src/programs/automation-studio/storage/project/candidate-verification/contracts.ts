import type { AutomationStudioCandidateRequirementBrief, AutomationStudioCandidateVerificationIdentity, AutomationStudioCandidateVerificationOutcome } from "../../../runtime/flow-bootstrap/verification/index.ts";

/** Immutable trusted association; no builder/API acceptance fields. */
export type AutomationStudioCandidateDurableBinding = {
  candidateId: string;
  identity: AutomationStudioCandidateVerificationIdentity;
  baseSettingsRevision: number;
  originalInstructionText: string;
  instructionSources: readonly { instructionId: string; revision: number; textDigest: string }[];
  permissionDigest: string;
  compilerVersion: string;
  registryDigest: string;
  normalizerVersion: string;
  issuerVersion: string;
};
export type AutomationStudioCandidateLedgerRequest = {
  attemptId: string;
  binding: AutomationStudioCandidateDurableBinding;
  brief: AutomationStudioCandidateRequirementBrief;
  conditionsDigest: string;
};
export type AutomationStudioCandidateLedgerStage = "start" | "execution" | "evidence" | "verification";
export type AutomationStudioCandidateLedgerRecord = {
  request: AutomationStudioCandidateLedgerRequest;
  status: "pending" | "committed" | "outcome_unknown";
  stages: Partial<Record<AutomationStudioCandidateLedgerStage, { status: "pending" | "committed" | "outcome_unknown"; payload?: unknown }>>;
  outcome?: Extract<AutomationStudioCandidateVerificationOutcome, { status: "draft" }>;
};
