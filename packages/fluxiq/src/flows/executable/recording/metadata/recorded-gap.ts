import type { JsonObject } from "../../../../core/index.ts";
import type { RecordingFlowActionCandidate } from "../../../../components/automation/importer/recording-mapper/index.ts";

export function recordingCandidateRecordedGapMetadata(candidate: RecordingFlowActionCandidate): JsonObject {
  return candidate.recordedGapMs === undefined ? {} : { recordedGapMs: candidate.recordedGapMs };
}
