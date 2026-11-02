import { expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../core/index.ts";
import { recordingFlowActionCandidate } from "../normalize.ts";
import { io } from "../../tests/fixtures.ts";
import type { RecordingCandidateInput } from "../input.ts";

const input = (candidate: RecordingCandidateInput["candidate"]): RecordingCandidateInput => ({ candidate, actionEntryId: "entry.action", sourceEntryId: "entry.source", recordingId: "recording.actual", domainId: "domain.actual", nextCandidateId: (id) => `candidate.${id}` });

it("preserves exact opaque parameter bytes with no normalizer and copies only the outer object", () => {
  const parameters: JsonObject = { target: { selector: "opaque", custom: [1, 2] }, element: { text: "kept as supplied" }, unknown: false };
  const candidate = recordingFlowActionCandidate(io, input({ outputId: "action.send", parameters }));
  expect(JSON.stringify(candidate.parameters)).toBe(JSON.stringify(parameters));
  expect(candidate.parameters).not.toBe(parameters);
  expect(candidate.parameters.target).toBe(parameters.target);
  expect(candidate.parameters.target).not.toHaveProperty("kind");
  expect(Object.keys(candidate)).toEqual(["candidateId", "actionEntryId", "sourceObservationIds", "sourceInputIds", "outputId", "parameters", "confidence", "evidence", "policyStateEligible"]);
});

it("runs only the injected normalizer with exact domain/source/output and keeps its result", () => {
  const parameters = { target: { raw: true } }, normalized = { domainOpaque: "normalized" };
  const normalizeParameters = vi.fn(() => normalized);
  const candidate = recordingFlowActionCandidate(io, { ...input({ outputId: " action.send ", parameters }), normalizeParameters });
  expect(normalizeParameters.mock.calls).toEqual([["domain.actual", parameters, { outputId: "action.send", sourceEntryId: "entry.source", source: "mapper" }]]);
  expect(candidate.parameters).toBe(normalized);
});

it.each([undefined, null, [], "not parameters", Promise.resolve({}), new Date(0)])("refuses a non-plain normalizer result before allocating a candidate (%j)", value => {
  const nextCandidateId = vi.fn(() => "unreached");
  expect(() => recordingFlowActionCandidate(io, { ...input({ outputId: "action.send" }), nextCandidateId, normalizeParameters: () => value as unknown as JsonObject })).toThrow("must return a plain parameter object");
  expect(nextCandidateId).not.toHaveBeenCalled();
});

it("retains exact ordered sources/evidence and field presence while cloning owned conditions", () => {
  const expectedState = { nested: { value: 1 } }, evidence = [{ layer: "evidence" as const, artifactId: "evidence.actual", observationId: "observed.actual" }];
  const candidate = recordingFlowActionCandidate(io, { ...input({ outputId: "action.send", sourceObservationIds: ["entry.action", "entry.third", "entry.source", ""], sourceInputIds: ["input.actual", "input.actual", ""], expectedConfirmation: { inputId: "input.actual" }, expectedState, evidence, confidence: 2, label: "", description: "Kept" }), recordedGapMs: 10.6 });
  expect(candidate.sourceObservationIds).toEqual(["entry.source", "entry.action", "entry.third"]);
  expect(candidate.sourceInputIds).toEqual(["input.actual"]);
  expect(candidate.evidence).toEqual(evidence);
  expect(candidate.evidence).not.toBe(evidence);
  expect(candidate.expectedState).toEqual(expectedState);
  expect(candidate.expectedState).not.toBe(expectedState);
  expect(candidate.confidence).toBe(1);
  expect(candidate.recordedGapMs).toBe(11);
  expect(candidate).not.toHaveProperty("label");
  expect(candidate.policyStateEligible).toBe(false);
});

it.each([
  [{ outputId: "" }, "must declare an outputId"],
  [{ outputId: "unknown" }, "unregistered output unknown"],
  [{ outputId: "action.send", sourceInputIds: ["missing"] }, "unregistered input missing"],
  [{ outputId: "action.send", sourceInputIds: ["state.only"] }, "cannot be reclassified as an action"],
  [{ outputId: "action.send", expectedConfirmation: { inputId: "missing" } }, "unregistered confirmation input missing"],
  [{ outputId: "action.send", expectedConfirmation: { inputId: "state.only" } }, "must be an action-role observation"],
  [{ outputId: "action.send", timeoutMs: 0 }, "invalid timeoutMs"],
  [{ outputId: "action.send", timeoutMs: 1.5 }, "invalid timeoutMs"],
  [{ outputId: "action.send", timeoutMs: Number.POSITIVE_INFINITY }, "invalid timeoutMs"]
])("rejects invalid registry/action/duration data before allocating an ID (%j)", (candidate, message) => {
  const nextCandidateId = vi.fn(() => "unreached");
  expect(() => recordingFlowActionCandidate(io, { ...input(candidate), nextCandidateId })).toThrow(message);
  expect(nextCandidateId).not.toHaveBeenCalled();
});

it("requires mapper-declared outputs as well as registered outputs", () => {
  expect(() => recordingFlowActionCandidate(io, { ...input({ outputId: "action.send" }), mapperOutputIds: ["records.read"] })).toThrow("undeclared output action.send");
  expect(recordingFlowActionCandidate(io, { ...input({ outputId: "action.send" }), mapperOutputIds: [] }).outputId).toBe("action.send");
});

it("resolves only the registered records path and rejects invalid/encrypted schemas", () => {
  const recordOutput = { datasetId: "dataset.actual", schema: { schemaVersion: "0.1" as const, fields: [{ id: "name", label: "Name", valueType: "string" as const }] }, writeMode: "append" as const };
  expect(recordingFlowActionCandidate(io, input({ outputId: "records.read", recordOutput })).recordOutput).toMatchObject({ ...recordOutput, recordsPath: "rows" });
  expect(recordingFlowActionCandidate(io, input({ outputId: "records.read", recordOutput: { ...recordOutput, recordsPath: "actual.rows" } })).recordOutput?.recordsPath).toBe("actual.rows");
  expect(() => recordingFlowActionCandidate(io, input({ outputId: "action.send", recordOutput }))).toThrow("record_output.missing_records_path");
  const encrypted = { ...recordOutput, schema: { ...recordOutput.schema, fields: [{ ...recordOutput.schema.fields[0]!, handling: "encrypt" as const }] } };
  expect(() => recordingFlowActionCandidate(io, input({ outputId: "records.read", recordOutput: encrypted }))).toThrow("record_schema.encrypt_unavailable");
});

it.each([Number.NaN, Number.POSITIVE_INFINITY, -1])("drops invalid gap %s and defaults nonfinite confidence", (recordedGapMs) => {
  const candidate = recordingFlowActionCandidate(io, { ...input({ outputId: "action.send", confidence: Number.NaN }), recordedGapMs });
  expect(candidate).not.toHaveProperty("recordedGapMs");
  expect(candidate.confidence).toBe(0.5);
});
