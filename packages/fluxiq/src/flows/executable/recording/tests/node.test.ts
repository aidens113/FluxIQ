import { expect, it } from "vitest";
import type { RecordingFlowActionCandidate } from "../../../../components/automation/importer/recording-mapper/index.ts";
import { recordingCandidateEdgeRecipe, recordingCandidateNodeRecipe, recordingCandidateRecordedGapMetadata, recordingCandidateStateLinkMetadata } from "../index.ts";

const candidate: RecordingFlowActionCandidate = {
  candidateId: "candidate.actual", actionEntryId: "entry.actual", sourceObservationIds: ["entry.actual"], sourceInputIds: ["input.actual"],
  outputId: "action.actual", parameters: { opaque: { value: 1 } }, expectedConfirmation: { inputId: "input.actual" }, expectedState: { opaque: true },
  recordOutput: { datasetId: "dataset.actual", recordsPath: "rows", schema: { schemaVersion: "0.1", fields: [{ id: "value", label: "Value", valueType: "string" }] }, writeMode: "append" },
  timeoutMs: 9000, recordedGapMs: 321, confidence: 0.9, evidence: [{ layer: "recording", artifactId: "recording.actual", entryId: "entry.actual" }],
  stateLink: { recordingId: "recording.actual", actionEntryId: "entry.actual", stateSnapshotId: "state.actual", stateRef: "states/actual.json" }, policyStateEligible: false
};

it("constructs the exact execution recipe without artifact/editor fields or input mutation", () => {
  const bytes = JSON.stringify(candidate);
  const recipe = recordingCandidateNodeRecipe({ proposalId: "proposal.actual", mapper: { id: "mapper.actual", version: "1.0.0" } }, candidate);
  expect(JSON.stringify(recipe)).toBe(JSON.stringify({
    definitionId: "builtin.policy.action", label: "action.actual",
    parameterValues: { outputId: "action.actual", parameters: { opaque: { value: 1 } }, confirmationInputId: "input.actual", confirmationTimeoutMs: 5000, expectedState: { opaque: true }, recordOutput: candidate.recordOutput, timeoutMs: 9000 },
    metadata: {
      recordingProposalId: "proposal.actual", recordingCandidateId: "candidate.actual", mapperId: "mapper.actual", mapperVersion: "1.0.0",
      actionEntryId: "entry.actual", timelineEntryId: "entry.actual", stateLink: candidate.stateLink, stateSnapshotId: "state.actual", stateRef: "states/actual.json", recordedGapMs: 321,
      sourceObservationIds: ["entry.actual"], evidence: candidate.evidence, rawEvidenceImmutable: true, manualProvenance: []
    }
  }));
  expect(recipe.parameterValues.parameters).not.toBe(candidate.parameters);
  expect(recipe.parameterValues.expectedState).not.toBe(candidate.expectedState);
  expect(recipe.parameterValues.recordOutput).not.toBe(candidate.recordOutput);
  expect(recipe.metadata.evidence).toBe(candidate.evidence);
  expect(recipe.metadata.sourceObservationIds).toBe(candidate.sourceObservationIds);
  expect(JSON.stringify(candidate)).toBe(bytes);
});

it("keeps absent metadata absent, includes zero gap, and retains explicit label/description", () => {
  const { stateLink: _state, recordedGapMs: _gap, ...bare } = candidate;
  expect(recordingCandidateStateLinkMetadata(bare)).toEqual({});
  expect(recordingCandidateRecordedGapMetadata(bare)).toEqual({});
  expect(recordingCandidateRecordedGapMetadata({ ...bare, recordedGapMs: 0 })).toEqual({ recordedGapMs: 0 });
  const node = recordingCandidateNodeRecipe({ proposalId: "proposal.actual", mapper: { id: "mapper.actual", version: "1.0.0" } }, { ...bare, label: "", description: "Kept" });
  expect(node.label).toBe("");
  expect(node.description).toBe("Kept");
  expect(node.metadata).not.toHaveProperty("screenshotRef");
});

it("connects only the existing success and ready ports with exact proposal metadata", () => {
  expect(JSON.stringify(recordingCandidateEdgeRecipe("proposal.actual", "node.first", "node.second"))).toBe('{"sourceNodeId":"node.first","targetNodeId":"node.second","sourcePortId":"success","targetPortId":"ready","metadata":{"recordingProposalId":"proposal.actual"}}');
});
