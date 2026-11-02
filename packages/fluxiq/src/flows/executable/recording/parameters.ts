import type { JsonObject } from "../../../core/index.ts";
import type { RecordingFlowActionCandidate } from "../../../components/automation/importer/recording-mapper/index.ts";

export function recordingCandidateExecutionParameters(candidate: RecordingFlowActionCandidate): JsonObject {
  return Object.fromEntries(Object.entries({
    outputId: candidate.outputId,
    parameters: structuredClone(candidate.parameters),
    ...(candidate.expectedConfirmation ? { confirmationInputId: candidate.expectedConfirmation.inputId, confirmationTimeoutMs: candidate.expectedConfirmation.timeoutMs ?? 5_000 } : {}),
    expectedState: candidate.expectedState ? structuredClone(candidate.expectedState) : undefined,
    recordOutput: candidate.recordOutput ? structuredClone(candidate.recordOutput) : undefined,
    timeoutMs: candidate.timeoutMs
  }).filter(([, value]) => value !== undefined)) as JsonObject;
}
