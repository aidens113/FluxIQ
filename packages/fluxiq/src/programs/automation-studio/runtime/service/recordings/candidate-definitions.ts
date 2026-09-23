import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioNodeDefinition } from "../../../nodes/index.ts";
import { recordingProposalDefinitionId, type RecordingFlowActionCandidate, type RecordingFlowProposalArtifact } from "../../recording-flow-proposal.ts";
import { compactJsonObject } from "../compact-json.ts";
import { isJsonRecord } from "../json-values.ts";
import { recordingCandidateRecordedGapMetadata, recordingCandidateStateLinkMetadata } from "./proposal-candidates.ts";

// A reviewed recording candidate as a reusable node definition, and a Flow node
// naming such a definition turned back into the recorded output action it
// stands for. A candidate's record output and timeout travel with the
// definition, unlike its expected state.

export function recordingCandidateDefinition(proposal: RecordingFlowProposalArtifact, candidate: RecordingFlowActionCandidate, visibility: "private" | "public"): AutomationStudioNodeDefinition {
  return {
    schemaVersion: "0.1",
    id: recordingProposalDefinitionId(proposal.proposalId, candidate.candidateId),
    version: "1.0.0",
    label: candidate.label ?? candidate.outputId,
    description: candidate.description ?? `Reviewed recording-derived action for ${candidate.outputId}.`,
    category: "recording-derived",
    source: { kind: "recording", proposalId: proposal.proposalId, mapperId: proposal.mapper.id },
    availability: proposal.domainId ? { kind: "domain", domainId: proposal.domainId } : { kind: "global" },
    capabilities: { executable: true, recordable: true, retryable: true },
    outputAction: { fixedOutputId: candidate.outputId },
    inputs: [{ id: "ready", label: "Ready", valueType: "any", role: "control" }],
    // The same records port the policy action declares (K3). A later node can
    // only be wired to a port the definition declares, because an author draws
    // from the definition while materialization into the policy action happens
    // at run and read time; without it a recorded extraction's rows are saved
    // but reach nothing.
    outputs: [
      { id: "success", label: "Success", valueType: "any", role: "success" },
      { id: "failed", label: "Failed", valueType: "any", role: "failure" },
      { id: "records", label: "Records", valueType: "array", role: "data" }
    ],
    parameters: recordingCandidateParameters(candidate),
    icon: "wand-sparkles",
    metadata: {
      visibility,
      candidateId: candidate.candidateId,
      outputId: candidate.outputId,
      parameters: candidate.parameters,
      ...(candidate.expectedConfirmation ? { expectedConfirmation: candidate.expectedConfirmation } : {}),
      ...(candidate.recordOutput ? { recordOutput: structuredClone(candidate.recordOutput) as unknown as JsonObject } : {}),
      ...(candidate.timeoutMs !== undefined ? { timeoutMs: candidate.timeoutMs } : {}),
      evidence: candidate.evidence,
      sourceObservationIds: candidate.sourceObservationIds,
      ...recordingCandidateStateLinkMetadata(candidate),
      ...recordingCandidateRecordedGapMetadata(candidate),
      policyStateEligible: false
    }
  };
}

export function recordingCandidateParameters(candidate: RecordingFlowActionCandidate): AutomationStudioNodeDefinition["parameters"] {
  const payload = candidate.parameters && typeof candidate.parameters === "object" && !Array.isArray(candidate.parameters) ? candidate.parameters as JsonObject : {};
  return [
    { id: "parameters", label: "Output payload", description: "Values passed to this recorded output action.", valueType: "object" as const, defaultValue: payload },
    ...(candidate.expectedConfirmation ? [
      { id: "confirmationInputId", label: "Confirmation input", description: "Action input stream that confirms the output occurred.", valueType: "string" as const, defaultValue: candidate.expectedConfirmation.inputId ?? "", ui: { control: "identifier" as const, placeholder: "Registered action input ID" } },
      { id: "confirmationTimeoutMs", label: "Confirmation timeout", description: "How long to wait for confirmation.", valueType: "number" as const, defaultValue: candidate.expectedConfirmation.timeoutMs ?? 5_000 }
    ] : []),
    // The recorded action's own settings, editable on the node with the same
    // controls a hand-authored action gets (K3, K12d). Each default is what the
    // recording proposed, so a node nobody edited runs as it was recorded, and
    // an operator can still see the extraction and change which fields it keeps.
    { id: "timeoutMs", label: "Give up after milliseconds", description: "Maximum time to wait before treating this action as failed.", valueType: "number" as const, defaultValue: candidate.timeoutMs ?? 5_000 },
    {
      id: "recordOutput",
      label: "Save extracted records",
      description: "Save the records this output returns as a table. Leave off to save none.",
      valueType: "json" as const,
      defaultValue: candidate.recordOutput ? structuredClone(candidate.recordOutput) as unknown as JsonObject : null,
      // A binding could replace the schema, and with it the excluded fields, at run time.
      allowStateBinding: false,
      ui: { control: "record-output" as const }
    }
  ];
}

// A node's own record output and timeout win over its definition's, unlike its
// output id and payload: these two are the node's editable parameters, so a
// definition that replaced them would silently undo every edit made to them --
// including excluding a column, which is how an operator keeps a field out of a
// dataset. A node nobody edited holds neither and takes what was recorded. The
// policy action parses the record output again before it dispatches.
export function materializeRecordingNode<T extends { definitionId: string; parameterValues?: JsonObject; metadata?: JsonObject }>(node: T, definition: AutomationStudioNodeDefinition | undefined): T {
  if (!definition || definition.source.kind !== "recording") return node;
  const confirmation = definition.metadata?.expectedConfirmation && typeof definition.metadata.expectedConfirmation === "object" && !Array.isArray(definition.metadata.expectedConfirmation) ? definition.metadata.expectedConfirmation as JsonObject : undefined;
  const authored = node.parameterValues ?? {};
  const recordOutput = definition.metadata?.recordOutput;
  const timeoutMs = definition.metadata?.timeoutMs;
  return {
    ...node,
    definitionId: "builtin.policy.action",
    parameterValues: compactJsonObject({
      ...authored,
      outputId: definition.metadata?.outputId,
      parameters: definition.metadata?.parameters ?? {},
      ...(typeof confirmation?.inputId === "string" ? { confirmationInputId: confirmation.inputId, confirmationTimeoutMs: typeof confirmation.timeoutMs === "number" ? confirmation.timeoutMs : 5_000 } : {}),
      // `null` is a value the node holds: the editor writes it when the
      // operator turns the extraction off, so it must not be overridden either.
      ...(authored.recordOutput === undefined && isJsonRecord(recordOutput) ? { recordOutput } : {}),
      ...(authored.timeoutMs === undefined && typeof timeoutMs === "number" ? { timeoutMs } : {})
    }),
    metadata: { ...(node.metadata ?? {}), recordingDefinitionId: definition.id, recordingProposalId: definition.source.proposalId }
  };
}
