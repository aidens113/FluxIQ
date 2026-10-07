import { AutomationStudioNodeRegistry } from "../../../../nodes/index.ts";
import type { AutomationStudioFlowInstruction } from "../../../../model/index.ts";
import { validateAutomationStudioFlowBootstrapPlan } from "../../../flow-bootstrap/plan/index.ts";
import { automationStudioCandidateFingerprint as fingerprint } from "../../../flow-bootstrap/candidate/index.ts";
import { plan } from "../../../tests/service-bootstrap/tests/fixtures.ts";
import { AutomationStudioCandidateSource as Source } from "../source.ts";
import type { AutomationStudioCandidateDraftReference, AutomationStudioFlowCandidateDraftRecord } from "../record.ts";

export const candidateSourceFixture = {
  instruction(extra: Partial<AutomationStudioFlowInstruction> = {}): AutomationStudioFlowInstruction {
    return { schemaVersion: "0.1", instructionId: "instruction.original", title: " Original title ", body: "Create a deterministic Start to End Flow.\nKeep every original clause.",
      scope: { kind: "flow", projectId: "project.1", flowId: "flow.1" }, status: "active", priority: 10, requirement: "required", tags: ["generation"],
      createdAt: 2, updatedAt: 3, metadata: { retained: ["full", 1] }, ...extra };
  },
  binding(instructions?: AutomationStudioFlowInstruction[]) {
    instructions ??= [candidateSourceFixture.instruction()];
    return Source.capture({ projectId: "project.1", flowId: "flow.1", instructions, inventoryInstructionIds: instructions.map(item => item.instructionId) });
  },
  record(): Extract<AutomationStudioFlowCandidateDraftRecord, { schemaVersion: 2 }> {
    const binding = this.binding(), instructionText = Source.text(binding);
    const checked = validateAutomationStudioFlowBootstrapPlan({ plan: plan(), registry: new AutomationStudioNodeRegistry(), resolution: { scope: { kind: "domain", domainId: "isolated" }, permissions: [], runtimeCapabilities: [] } });
    if (!checked.ok || !checked.validated) throw new Error("Invalid owning normalized plan fixture");
    const candidate = { revision: 1, digest: fingerprint.candidate({ projectId: "project.1", flowId: "flow.1", baseDependencyDigest: "base", instructionText, buildPlan: checked.validated, originalInstructionsDigest: binding.originalInstructionsDigest }),
      baseDependencyDigest: "base", status: "draft" as const, summary: "Unverified", buildPlan: checked.validated, changedPaths: ["plan"],
      fingerprintVersion: "candidate.plan+original_sources.v2" as const, originalInstructionsDigest: binding.originalInstructionsDigest };
    return { kind: "flow_candidate_draft", schemaVersion: 2, status: "draft", verification: "not_performed", candidateId: "candidate.1", projectId: "project.1", flowId: "flow.1",
      sourceInstructionIds: [...binding.originalSources.effectiveInstructionIds], instructionText, baseSettingsRevision: 1, candidate, ...binding,
      accounting: { requestId: "request.1", estimatedInputTokens: 10 }, createdAt: 4 };
  },
  reference(record?: Extract<AutomationStudioFlowCandidateDraftRecord, { schemaVersion: 2 }>): AutomationStudioCandidateDraftReference {
    record ??= candidateSourceFixture.record();
    return { projectId: record.projectId, flowId: record.flowId, candidateId: record.candidateId, revision: record.candidate.revision, digest: record.candidate.digest,
      baseDependencyDigest: record.candidate.baseDependencyDigest, baseSettingsRevision: record.baseSettingsRevision, originalInstructionsDigest: record.originalInstructionsDigest };
  },
};
