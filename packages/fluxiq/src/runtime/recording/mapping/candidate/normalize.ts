import type { RecordingFlowActionCandidate } from "../../../../components/automation/importer/recording-mapper/index.ts";
import { cloneRecordingExpectedState } from "../expected-state/index.ts";
import type { RecordingMappingIo } from "../io.ts";
import type { RecordingCandidateInput } from "./input.ts";
import { RecordingCandidateValidationError } from "./error.ts";
import { recordingCandidateRecordOutput } from "./record-output.ts";
import { recordingCandidateTimeout } from "./timeout.ts";

/** Validate against the actual registry and retain the original candidate projection. */
export function recordingFlowActionCandidate(io: RecordingMappingIo, input: RecordingCandidateInput): RecordingFlowActionCandidate {
  const outputId = input.candidate.outputId?.trim();
  if (!outputId) throw RecordingCandidateValidationError.output("missing");
  if (input.mapperOutputIds?.length && !input.mapperOutputIds.includes(outputId)) throw RecordingCandidateValidationError.output("undeclared", outputId);
  if (!io.hasOutput(input.domainId, outputId)) throw RecordingCandidateValidationError.output("unregistered", outputId);
  const sourceInputIds = [...new Set((input.candidate.sourceInputIds ?? []).filter(Boolean))];
  for (const inputId of sourceInputIds) {
    const adapter = io.getInput(input.domainId, inputId);
    if (!adapter) throw RecordingCandidateValidationError.input("missing_source", inputId);
    if ((adapter.definition.role ?? "state") !== "action") throw RecordingCandidateValidationError.input("state_source", inputId);
  }
  const confirmation = input.candidate.expectedConfirmation;
  if (confirmation) {
    const adapter = io.getInput(input.domainId, confirmation.inputId);
    if (!adapter) throw RecordingCandidateValidationError.input("missing_confirmation", confirmation.inputId);
    if ((adapter.definition.role ?? "state") !== "action") throw RecordingCandidateValidationError.input("state_confirmation", confirmation.inputId);
  }
  const sourceObservationIds = [...new Set([input.sourceEntryId, input.actionEntryId, ...(input.candidate.sourceObservationIds ?? [])].filter(Boolean))];
  const parameters = input.normalizeParameters
    ? input.normalizeParameters(input.domainId, input.candidate.parameters ?? {}, { outputId, sourceEntryId: input.sourceEntryId, source: "mapper" })
    : { ...(input.candidate.parameters ?? {}) };
  if (input.normalizeParameters) {
    if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)) throw RecordingCandidateValidationError.normalizer(outputId);
    const prototype = Object.getPrototypeOf(parameters);
    if (prototype !== null && Object.getPrototypeOf(prototype) !== null) throw RecordingCandidateValidationError.normalizer(outputId);
  }
  const expectedState = cloneRecordingExpectedState(input.candidate.expectedState);
  const recordOutput = recordingCandidateRecordOutput(io, input.domainId, outputId, input.candidate.recordOutput);
  const timeoutMs = recordingCandidateTimeout(outputId, input.candidate.timeoutMs);
  const gap = input.recordedGapMs;
  const recordedGapMs = typeof gap === "number" && Number.isFinite(gap) && gap >= 0 ? Math.round(gap) : undefined;
  return {
    candidateId: input.nextCandidateId(input.actionEntryId),
    actionEntryId: input.actionEntryId,
    sourceObservationIds,
    sourceInputIds,
    outputId,
    parameters,
    ...(confirmation ? { expectedConfirmation: { ...confirmation } } : {}),
    ...(expectedState.kind === "state" ? { expectedState: expectedState.state } : {}),
    ...(recordOutput ? { recordOutput } : {}),
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
    confidence: clampConfidence(input.candidate.confidence),
    evidence: input.candidate.evidence?.length ? structuredClone(input.candidate.evidence) : sourceObservationIds.map((entryId) => ({ layer: "recording" as const, artifactId: input.recordingId, entryId })),
    ...(input.stateLink ? { stateLink: input.stateLink } : {}),
    ...(recordedGapMs !== undefined ? { recordedGapMs } : {}),
    policyStateEligible: false,
    ...(input.candidate.label ? { label: input.candidate.label } : {}),
    ...(input.candidate.description ? { description: input.candidate.description } : {})
  };
}

function clampConfidence(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.5;
}
