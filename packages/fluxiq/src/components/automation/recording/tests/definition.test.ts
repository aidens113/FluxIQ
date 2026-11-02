import { expect, it } from "vitest";
import type { RecordingFlowActionCandidate } from "../../importer/recording-mapper/index.ts";
import { materializeRecordingNode, recordingCandidateDefinition, recordingCandidateParameters, recordingProposalDefinitionId } from "../index.ts";

const candidate: RecordingFlowActionCandidate = { candidateId: "candidate.actual", actionEntryId: "entry.actual", sourceObservationIds: ["entry.actual"], sourceInputIds: [], outputId: "action.actual", parameters: { opaque: { value: 1 } }, expectedState: { ignoredByDefinition: true }, confidence: 0.5, evidence: [], policyStateEligible: false, timeoutMs: 7000,
  recordOutput: { datasetId: "dataset.actual", recordsPath: "rows", schema: { schemaVersion: "0.1", fields: [{ id: "value", label: "Value", valueType: "string" }] }, writeMode: "append" } };
const context = { proposalId: "proposal.actual", domainId: "domain.actual", mapper: { id: "mapper.actual" } };

it("consumes only the minimal proposal context and preserves actual parameter/evidence references", () => {
  const definition = recordingCandidateDefinition(context, candidate, "private");
  expect(definition.source).toEqual({ kind: "recording", proposalId: "proposal.actual", mapperId: "mapper.actual" });
  expect(definition.availability).toEqual({ kind: "domain", domainId: "domain.actual" });
  expect(definition.metadata?.parameters).toBe(candidate.parameters);
  expect(definition.metadata?.evidence).toBe(candidate.evidence);
  expect(definition.metadata?.recordOutput).toEqual(candidate.recordOutput);
  expect(definition.metadata?.recordOutput).not.toBe(candidate.recordOutput);
  expect(definition.metadata).not.toHaveProperty("expectedState");
  expect(definition.outputs.map((port) => port.id)).toEqual(["success", "failed", "records"]);
  expect(recordingCandidateParameters(candidate).find((parameter) => parameter.id === "recordOutput")).toMatchObject({ allowStateBinding: false, ui: { control: "record-output" } });
});

it("retains authored null/schema and timeout edits while defaulting only absent values", () => {
  const definition = recordingCandidateDefinition(context, candidate, "public");
  const disabled = { id: "node.actual", definitionId: definition.id, parameterValues: { recordOutput: null, timeoutMs: 1200 } };
  expect(materializeRecordingNode(disabled, definition).parameterValues).toEqual({ recordOutput: null, timeoutMs: 1200, outputId: "action.actual", parameters: candidate.parameters });
  const inherited = materializeRecordingNode({ definitionId: definition.id, parameterValues: {} }, definition);
  expect(inherited.parameterValues).toMatchObject({ recordOutput: candidate.recordOutput, timeoutMs: 7000 });
  expect(materializeRecordingNode(disabled, undefined)).toBe(disabled);
});

it("retains the historical definition-ID escaping and empty item fallback", () => {
  expect(recordingProposalDefinitionId("  proposal/a  ", "---")).toBe("recording.proposal-a.item");
  expect(recordingProposalDefinitionId("UPPER._-", "a:b")).toBe("recording.UPPER._.a-b");
});
