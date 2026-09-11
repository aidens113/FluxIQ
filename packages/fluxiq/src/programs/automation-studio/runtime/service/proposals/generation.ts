import type { JsonObject } from "../../../../../core/index.ts";
import type { RecordingFlowProposalArtifact } from "../../recording-flow-proposal.ts";
import { compactJsonObject } from "../compact-json.ts";
import { errorMessage } from "../error-message.ts";
import type { AutomationStudioFacadePorts } from "../facade-ports.ts";
import type { AutomationStudioRecordingStore } from "../recordings/index.ts";
import type { CreateRecordingFlowProposalsResult, GenerateRecordingProposalInput, GenerateRecordingProposalResult } from "./types.ts";

// Proposal generation over one finalized recording: the recording mapper
// first, and the evidence miner only when the mapper produced nothing. Both
// paths are stamped with the same generation metadata so a reviewer can tell
// which produced what, and a replaced proposal is deleted only once a
// replacement exists.
export class AutomationStudioProposalGeneration {
  constructor(
    private readonly recordings: AutomationStudioRecordingStore,
    private readonly facade: AutomationStudioFacadePorts
  ) {}

  async generateRecordingProposal(input: GenerateRecordingProposalInput): Promise<GenerateRecordingProposalResult> {
    const mode = input.mode === "llm_assisted" ? "llm_assisted" : "direct";
    const generationMode = "direct";
    const replaceProposalId = input.replaceProposalId?.trim();
    const generationMetadata = compactJsonObject({
      recordingId: input.recordingId,
      generationMode,
      ...(mode === "llm_assisted" ? { requestedGenerationMode: mode, llmAssistanceStatus: "not_invoked" } : {}),
      ...(input.title?.trim() ? { title: input.title.trim() } : {}),
      ...(input.instructions?.trim() ? { instructions: input.instructions.trim() } : {}),
      ...(input.constraints?.trim() ? { constraints: input.constraints.trim() } : {}),
      createdFromView: "proposal-generator",
      generatedBy: "recording_mapper"
    });
    let flowResult: CreateRecordingFlowProposalsResult = { proposals: [], issues: [] };
    try {
      flowResult = await this.facade.createRecordingFlowProposals({ projectId: input.projectId, recordingId: input.recordingId, force: true });
    } catch (error) {
      flowResult = { proposals: [], issues: [errorMessage(error, "Recording Flow proposals could not be created.")] };
    }
    if (flowResult.proposals.length) {
      const proposals: RecordingFlowProposalArtifact[] = [];
      for (const proposal of flowResult.proposals) {
        const next = {
          ...proposal,
          metadata: compactJsonObject({
            ...(proposal.metadata ?? {}),
            ...generationMetadata,
            generatedBy: "recording_mapper"
          })
        };
        await this.recordings.writePipelineArtifact(input.projectId, "recordingFlowProposals", next.proposalId, next as unknown as JsonObject);
        proposals.push(next);
      }
      if (replaceProposalId) await this.facade.deleteProposal({ projectId: input.projectId, proposalId: replaceProposalId, kind: "auto" });
      return {
        schemaVersion: "0.1",
        recordingId: input.recordingId,
        mode,
        status: "processed",
        recordingFlowProposals: proposals,
        issues: flowResult.issues,
        generatedAt: Date.now()
      };
    }
    const processed = await this.facade.processFinalizedRecording({ projectId: input.projectId, recordingId: input.recordingId, force: true });
    let proposal = processed.proposal;
    if (proposal) {
      proposal = {
        ...proposal,
        metadata: compactJsonObject({
          ...(proposal.metadata ?? {}),
          ...generationMetadata,
          generatedBy: "evidence_miner"
        })
      };
      await this.recordings.writePipelineArtifact(input.projectId, "policyProposals", proposal.proposalId, proposal as unknown as JsonObject);
    }
    const recordingFlowProposals = processed.recordingFlowProposals?.length
      ? await Promise.all(processed.recordingFlowProposals.map(async (item) => {
        const next = {
          ...item,
          metadata: compactJsonObject({
            ...(item.metadata ?? {}),
            ...generationMetadata,
            generatedBy: "recording_mapper"
          })
        };
        await this.recordings.writePipelineArtifact(input.projectId, "recordingFlowProposals", next.proposalId, next as unknown as JsonObject);
        return next;
      }))
      : undefined;
    if (replaceProposalId && (proposal || recordingFlowProposals?.length)) await this.facade.deleteProposal({ projectId: input.projectId, proposalId: replaceProposalId, kind: "auto" });
    const issues = [...flowResult.issues, ...processed.issues];
    if (!proposal && !recordingFlowProposals?.length) {
      issues.push("No proposal artifact was generated from this recording.");
    }
    return {
      schemaVersion: "0.1",
      recordingId: input.recordingId,
      mode,
      status: proposal || recordingFlowProposals?.length ? "processed" : processed.status,
      ...(proposal ? { proposal } : {}),
      ...(recordingFlowProposals?.length ? { recordingFlowProposals } : {}),
      issues,
      generatedAt: Date.now()
    };
  }
}
