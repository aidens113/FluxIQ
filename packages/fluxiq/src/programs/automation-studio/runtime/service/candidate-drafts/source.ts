import { validateAutomationStudioFlowInstruction, type AutomationStudioFlowInstruction } from "../../../model/index.ts";
import { resolveAutomationStudioLlmInstructions, type AutomationStudioInstructionResolution } from "../../llm/index.ts";
import { automationStudioCandidateFingerprint as fingerprint } from "../../flow-bootstrap/candidate/index.ts";
import type { AutomationStudioCandidateOriginalSourceBinding } from "../../flow-bootstrap/candidate/index.ts";
import { sanitizedBootstrapAccounting } from "../../flow-bootstrap/index.ts";
import type { AutomationStudioFlowCandidateDraftRecord } from "./record.ts";

/** Reconciles historical original bytes. It cannot establish inventory/pin authority. */
export class AutomationStudioCandidateSource {
  static capture(input: { projectId: string; flowId: string; inventoryInstructionIds: readonly string[]; instructions: readonly AutomationStudioFlowInstruction[]; resolution?: AutomationStudioInstructionResolution }): AutomationStudioCandidateOriginalSourceBinding {
    input = fingerprint.snapshot(input);
    const projectId = input.projectId, flowId = input.flowId;
    const ids = fingerprint.snapshot(input.inventoryInstructionIds), instructions = fingerprint.snapshot(input.instructions);
    if (!identifier(projectId) || !identifier(flowId) || !Array.isArray(ids) || !ids.length || ids.some(id => !identifier(id)) || new Set(ids).size !== ids.length
      || !Array.isArray(instructions) || instructions.length !== ids.length || new Set(instructions.map(item => item.instructionId)).size !== instructions.length) throw new Error("candidate.original_inventory_invalid");
    for (const instruction of instructions) {
      if (!instruction || !ids.includes(instruction.instructionId) || instruction.status !== "active" || !validateAutomationStudioFlowInstruction(instruction).ok) throw new Error("candidate.original_inventory_mismatch");
    }
    const resolved = resolveAutomationStudioLlmInstructions({ projectId, flowId, instructions: [...instructions] });
    if (!resolved.instructions.length || resolved.diagnostics.some(item => item.severity === "error")) throw new Error("candidate.original_resolution_invalid");
    if (input.resolution && (JSON.stringify(input.resolution.instructionIds) !== JSON.stringify(resolved.instructionIds)
      || JSON.stringify(fingerprint.snapshot(input.resolution.instructions)) !== JSON.stringify(fingerprint.snapshot(resolved.instructions)))) throw new Error("candidate.original_resolution_mismatch");
    const originalSources = fingerprint.snapshot({ schemaVersion: "candidate.original_sources.v1" as const, projectId, flowId,
      inventoryInstructionIds: [...ids].sort(), instructions: [...instructions].sort((a, b) => a.instructionId < b.instructionId ? -1 : a.instructionId > b.instructionId ? 1 : 0),
      effectiveInstructionIds: resolved.instructionIds,
      excludedInstructionIds: ids.filter(id => !resolved.instructionIds.includes(id)).sort() });
    return fingerprint.snapshot({ originalSources, originalInstructionsDigest: fingerprint.source(originalSources) });
  }

  static validate(value: AutomationStudioCandidateOriginalSourceBinding): AutomationStudioCandidateOriginalSourceBinding {
    const binding = fingerprint.snapshot(value);
    if (!exact(binding, ["originalSources", "originalInstructionsDigest"]) || !hash(binding.originalInstructionsDigest)
      || !exact(binding.originalSources, ["schemaVersion", "projectId", "flowId", "inventoryInstructionIds", "instructions", "effectiveInstructionIds", "excludedInstructionIds"])
      || binding.originalSources.schemaVersion !== "candidate.original_sources.v1") throw new Error("candidate.original_binding_invalid");
    const source = binding.originalSources;
    const expected = this.capture({ projectId: source.projectId, flowId: source.flowId, inventoryInstructionIds: source.inventoryInstructionIds, instructions: source.instructions });
    if (fingerprint.source(source) !== expected.originalInstructionsDigest || binding.originalInstructionsDigest !== expected.originalInstructionsDigest) throw new Error("candidate.original_binding_mismatch");
    return binding;
  }

  static text(binding: AutomationStudioCandidateOriginalSourceBinding): string {
    return binding.originalSources.effectiveInstructionIds.map(id => {
      const instruction = binding.originalSources.instructions.find(item => item.instructionId === id)!;
      return `${instruction.title}\n${instruction.body}`;
    }).join("\n");
  }

  static record(value: unknown, projectId: string, flowId: string): { status: "valid"; record: AutomationStudioFlowCandidateDraftRecord } | { status: "invalid"; code: "candidate.source_record_invalid" } {
    const invalid = () => ({ status: "invalid" as const, code: "candidate.source_record_invalid" as const });
    try {
      const record = fingerprint.snapshot(value) as AutomationStudioFlowCandidateDraftRecord;
      if (!record || record.kind !== "flow_candidate_draft" || record.status !== "draft" || record.verification !== "not_performed" || record.projectId !== projectId || record.flowId !== flowId
        || !identifier(record.candidateId) || !record.candidate || record.candidate.status !== "draft" || !hash(record.candidate.digest)
        || !Number.isSafeInteger(record.candidate.revision) || record.candidate.revision < 1 || !record.candidate.buildPlan) return invalid();
      if (record.schemaVersion === 1) {
        if (Object.hasOwn(record, "originalSources") || Object.hasOwn(record, "originalInstructionsDigest")
          || Object.hasOwn(record.candidate, "fingerprintVersion") || Object.hasOwn(record.candidate, "originalInstructionsDigest")) return invalid();
        return { status: "valid", record };
      }
      if (record.schemaVersion !== 2 || !exact(record, ["kind", "schemaVersion", "status", "verification", "candidateId", "projectId", "flowId", "sourceInstructionIds", "instructionText", "baseSettingsRevision", "candidate", "accounting", "createdAt", "originalSources", "originalInstructionsDigest"])
        || !exact(record.candidate, ["revision", "digest", "baseDependencyDigest", "status", "summary", "buildPlan", "changedPaths", "fingerprintVersion", "originalInstructionsDigest"])
        || record.candidate.fingerprintVersion !== "candidate.plan+original_sources.v2" || record.candidate.originalInstructionsDigest !== record.originalInstructionsDigest
        || !Number.isSafeInteger(record.baseSettingsRevision) || record.baseSettingsRevision < 0 || !Number.isFinite(record.createdAt) || record.createdAt < 0
        || !identifier(record.candidate.baseDependencyDigest) || typeof record.candidate.summary !== "string" || !Array.isArray(record.candidate.changedPaths) || record.candidate.changedPaths.some(item => typeof item !== "string")
        || !record.accounting || !identifier(record.accounting.requestId) || !Number.isSafeInteger(record.accounting.estimatedInputTokens) || record.accounting.estimatedInputTokens < 0) return invalid();
      if (JSON.stringify(fingerprint.snapshot(record.accounting)) !== JSON.stringify(fingerprint.snapshot(sanitizedBootstrapAccounting(record.accounting)))) return invalid();
      const binding = this.validate({ originalSources: record.originalSources, originalInstructionsDigest: record.originalInstructionsDigest });
      if (binding.originalSources.projectId !== projectId || binding.originalSources.flowId !== flowId
        || JSON.stringify(record.sourceInstructionIds) !== JSON.stringify(binding.originalSources.effectiveInstructionIds) || record.instructionText !== this.text(binding)
        || record.candidate.digest !== fingerprint.candidate({ projectId, flowId, baseDependencyDigest: record.candidate.baseDependencyDigest, instructionText: record.instructionText,
          buildPlan: record.candidate.buildPlan, originalInstructionsDigest: binding.originalInstructionsDigest })) return invalid();
      // Match the owning read-only observation size including ProgramJsonStore envelope.
      fingerprint.snapshot({ version: 1, data: record });
      return { status: "valid", record };
    } catch { return invalid(); }
  }
}

function identifier(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 200 && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value); }
function hash(value: unknown): value is string { return typeof value === "string" && /^[a-f0-9]{64}$/.test(value); }
function exact(value: unknown, keys: string[]): boolean { return !!value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)); }
