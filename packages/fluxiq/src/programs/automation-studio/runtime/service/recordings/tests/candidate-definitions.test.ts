import type { AutomationStudioRecordOutput } from "@fluxiq/contracts/automation-studio";
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { RecordingFlowActionCandidate, RecordingFlowProposalArtifact } from "../../../recording-flow-proposal.ts";
import { materializeRecordingNode, recordingCandidateDefinition, recordingCandidateParameters } from "../candidate-definitions.ts";

// `candidate-definitions.ts`, called directly: the definition a reviewed
// recording candidate describes, and a Flow node naming one materialized as the
// recorded output action it stands for. The service rows that approved a
// proposal into definitions were deleted in t545: t519 retired that approval,
// and its refusal is pinned in `instruction-led/tests/service.test.ts`.

// One field kept, and one the schema excludes.
function productSchema(): AutomationStudioRecordOutput["schema"] {
  return { schemaVersion: "0.1", fields: [{ id: "name", label: "Name", valueType: "string", required: true }, { id: "email", label: "Email", valueType: "string", handling: "exclude" }] };
}

describe("the candidate definition functions, called directly", () => {
  const candidate: RecordingFlowActionCandidate = {
    candidateId: "candidate.entry-1.fixed",
    actionEntryId: "entry-1",
    sourceObservationIds: ["entry-1"],
    sourceInputIds: ["clicked"],
    outputId: "click",
    parameters: { field: "submit" },
    confidence: 0.9,
    evidence: [{ layer: "recording", artifactId: "recording.direct", entryId: "entry-1" }],
    policyStateEligible: false
  };
  const proposal: RecordingFlowProposalArtifact = {
    schemaVersion: "0.1",
    proposalId: "proposal.direct",
    projectId: "project.direct",
    recordingId: "recording.direct",
    domainId: null,
    mapper: { id: "click-mapper", version: "1.0.0", packageId: "example.importer", packageVersion: "1.0.0" },
    status: "proposed",
    candidates: [candidate],
    generatedAt: 1,
    updatedAt: 1
  };

  it("makes a domainless proposal's definition global and writes a candidate's state link into its metadata", () => {
    const stateLink = { recordingId: "recording.direct", actionEntryId: "entry-1", stateSnapshotId: "state-1", stateRef: "states/state-1.json" };
    const definition = recordingCandidateDefinition(proposal, { ...candidate, stateLink }, "private");
    expect(definition.id).toBe("recording.proposal.direct.candidate.entry-1.fixed");
    expect(definition.availability).toEqual({ kind: "global" });
    expect(definition.metadata).toEqual({
      visibility: "private",
      candidateId: "candidate.entry-1.fixed",
      outputId: "click",
      parameters: { field: "submit" },
      evidence: [{ layer: "recording", artifactId: "recording.direct", entryId: "entry-1" }],
      sourceObservationIds: ["entry-1"],
      stateLink,
      stateSnapshotId: "state-1",
      stateRef: "states/state-1.json",
      policyStateEligible: false
    });
    expect(definition.metadata).not.toHaveProperty("screenshotRef");
  });

  it("offers an empty payload for a non-object one, and defaults a confirmation's input to empty and its timeout to 5000 ms", () => {
    expect(recordingCandidateParameters({ ...candidate, parameters: ["not", "an", "object"] as unknown as JsonObject }).map((parameter) => [parameter.id, parameter.defaultValue])).toEqual([
      ["parameters", {}],
      ["timeoutMs", 5_000],
      ["recordOutput", null]
    ]);
    const defaults = recordingCandidateParameters({ ...candidate, expectedConfirmation: { inputId: undefined as unknown as string } });
    expect(defaults.map((parameter) => [parameter.id, parameter.defaultValue])).toEqual([["parameters", { field: "submit" }], ["confirmationInputId", ""], ["confirmationTimeoutMs", 5_000], ["timeoutMs", 5_000], ["recordOutput", null]]);
  });

  it("returns a node unchanged when it names no recording definition", () => {
    const node = { id: "authored", definitionId: "builtin.policy.action", parameterValues: { outputId: "click" } };
    const definition = recordingCandidateDefinition(proposal, candidate, "public");
    expect(materializeRecordingNode(node, undefined)).toBe(node);
    expect(materializeRecordingNode(node, { ...definition, source: { kind: "builtin", implementationKey: "policy.action" } })).toBe(node);
  });

  it("turns a node naming a recording definition into the policy action, keeping its other values and metadata", () => {
    const definition = recordingCandidateDefinition(proposal, { ...candidate, expectedConfirmation: { inputId: "clicked" } }, "public");
    const node = { id: "recorded", definitionId: definition.id, label: "Kept", parameterValues: { parameters: { authored: "replaced" }, timeoutMs: 900 }, metadata: { authored: true } };
    expect(materializeRecordingNode(node, definition)).toEqual({
      id: "recorded",
      definitionId: "builtin.policy.action",
      label: "Kept",
      parameterValues: { parameters: { field: "submit" }, timeoutMs: 900, outputId: "click", confirmationInputId: "clicked", confirmationTimeoutMs: 5_000 },
      metadata: { authored: true, recordingDefinitionId: definition.id, recordingProposalId: "proposal.direct" }
    });
    expect(node.definitionId).toBe(definition.id);
  });

  it("drops an output id its definition lacks, defaults the payload to empty, and writes no confirmation without a string input id", () => {
    const definition = recordingCandidateDefinition(proposal, candidate, "public");
    const node: { id: string; definitionId: string; parameterValues?: JsonObject; metadata?: JsonObject } = { id: "recorded", definitionId: definition.id };
    const materialized = materializeRecordingNode(node, { ...definition, metadata: { expectedConfirmation: { inputId: 7 } } });
    expect(materialized).toEqual({ id: "recorded", definitionId: "builtin.policy.action", parameterValues: { parameters: {} }, metadata: { recordingDefinitionId: definition.id, recordingProposalId: "proposal.direct" } });
    expect(materialized.parameterValues).not.toHaveProperty("outputId");
    expect(materialized.parameterValues).not.toHaveProperty("confirmationInputId");
  });

  const recordOutput: AutomationStudioRecordOutput = { datasetId: "products", recordsPath: "extracted", schema: productSchema(), writeMode: "append" };

  it("writes a candidate's record output, as a copy, and its timeout into its definition's metadata", () => {
    const withRecords: RecordingFlowActionCandidate = { ...candidate, recordOutput: structuredClone(recordOutput), timeoutMs: 30_000 };
    const definition = recordingCandidateDefinition(proposal, withRecords, "public");
    expect(definition.metadata).toMatchObject({ recordOutput, timeoutMs: 30_000 });
    expect(definition.metadata?.recordOutput).not.toBe(withRecords.recordOutput);
  });

  it("offers the recorded extraction and timeout as the editable parameters' defaults", () => {
    const withRecords: RecordingFlowActionCandidate = { ...candidate, recordOutput: structuredClone(recordOutput), timeoutMs: 30_000 };
    expect(recordingCandidateParameters(withRecords).map((parameter) => [parameter.id, parameter.defaultValue])).toEqual([["parameters", { field: "submit" }], ["timeoutMs", 30_000], ["recordOutput", recordOutput]]);
    expect(recordingCandidateParameters(candidate).map((parameter) => [parameter.id, parameter.defaultValue])).toEqual([["parameters", { field: "submit" }], ["timeoutMs", 5_000], ["recordOutput", null]]);
    // The default is a copy, so editing the node can never reach the stored definition.
    expect(recordingCandidateParameters(withRecords)[2]?.defaultValue).not.toBe(withRecords.recordOutput);
  });

  it("takes its definition's record output and timeout when the node holds none of its own", () => {
    const definition = recordingCandidateDefinition(proposal, { ...candidate, recordOutput: structuredClone(recordOutput), timeoutMs: 30_000 }, "public");
    const node: { id: string; definitionId: string; parameterValues?: JsonObject } = { id: "recorded", definitionId: definition.id };
    expect(materializeRecordingNode(node, definition).parameterValues).toEqual({ parameters: { field: "submit" }, outputId: "click", recordOutput, timeoutMs: 30_000 });
  });

  // The record-output editor and the timeout field write these onto the node. A
  // definition that overrode them would make every such edit do nothing, so an
  // operator who excluded a column would still have that column collected.
  it("keeps the node's own record output and timeout over its definition's", () => {
    const definition = recordingCandidateDefinition(proposal, { ...candidate, recordOutput: structuredClone(recordOutput), timeoutMs: 30_000 }, "public");
    const edited = { ...recordOutput, datasetId: "edited" } as unknown as JsonObject;
    const node = { id: "recorded", definitionId: definition.id, parameterValues: { recordOutput: edited, timeoutMs: 900 } };
    expect(materializeRecordingNode(node, definition).parameterValues).toEqual({ parameters: { field: "submit" }, outputId: "click", recordOutput: edited, timeoutMs: 900 });
  });

  it("saves no records when the node turned its definition's record output off", () => {
    const definition = recordingCandidateDefinition(proposal, { ...candidate, recordOutput: structuredClone(recordOutput), timeoutMs: 30_000 }, "public");
    const node = { id: "recorded", definitionId: definition.id, parameterValues: { recordOutput: null } };
    expect(materializeRecordingNode(node, definition).parameterValues).toMatchObject({ recordOutput: null, timeoutMs: 30_000 });
  });

  it("gives a node no record output or timeout its definition does not hold as an object and a number", () => {
    const definition = recordingCandidateDefinition(proposal, candidate, "public");
    const node: { id: string; definitionId: string; parameterValues?: JsonObject } = { id: "recorded", definitionId: definition.id };
    const materialized = materializeRecordingNode(node, { ...definition, metadata: { ...definition.metadata, recordOutput: ["products"], timeoutMs: "30000" } });
    expect(materialized.parameterValues).toEqual({ outputId: "click", parameters: { field: "submit" } });
  });
});
