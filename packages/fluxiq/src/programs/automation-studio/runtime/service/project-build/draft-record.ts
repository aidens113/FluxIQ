import type { AutomationStudioBootstrapAccounting } from "../../flow-bootstrap/index.ts";
import { automationStudioCandidateFingerprint as fingerprint, type AutomationStudioCandidateOriginalSourceBinding, type AutomationStudioFlowCandidate } from "../../flow-bootstrap/candidate/index.ts";
import { AutomationStudioCandidateSource as Source, type AutomationStudioFlowCandidateDraftRecord } from "../candidate-drafts/index.ts";

// The draft a project build keeps (unit A5c): the assembled whole candidate,
// saved exactly as a candidate build saves its own
// (`../flow-bootstrap-commands/candidate-generation.ts`, `draftRecord`), so the
// draft store, the promotion and the chat read it as one. Bound to the
// original instructions when the build was.

export function automationStudioProjectBuildDraftRecord(input: {
  candidateId: string;
  projectId: string;
  flowId: string;
  candidate: AutomationStudioFlowCandidate;
  accounting: AutomationStudioBootstrapAccounting;
  sourceInstructionIds: readonly string[];
  instructionText: string;
  baseSettingsRevision: number;
  originalSource?: AutomationStudioCandidateOriginalSourceBinding | undefined;
}): AutomationStudioFlowCandidateDraftRecord {
  const originalSource = input.originalSource ? Source.validate(input.originalSource) : undefined;
  const sourceInstructionIds = originalSource ? fingerprint.snapshot([...input.sourceInstructionIds]) : [...input.sourceInstructionIds];
  const common = { kind: "flow_candidate_draft" as const, status: "draft" as const, verification: "not_performed" as const,
    candidateId: input.candidateId, projectId: input.projectId, flowId: input.flowId, sourceInstructionIds: [...sourceInstructionIds], instructionText: input.instructionText,
    baseSettingsRevision: input.baseSettingsRevision, accounting: input.accounting, createdAt: Date.now() };
  return originalSource
    ? { ...common, schemaVersion: 2, originalSources: originalSource.originalSources, originalInstructionsDigest: originalSource.originalInstructionsDigest,
        candidate: { ...input.candidate, fingerprintVersion: "candidate.plan+original_sources.v2", originalInstructionsDigest: originalSource.originalInstructionsDigest } }
    : { ...common, schemaVersion: 1, candidate: input.candidate };
}
