import type { JsonObject } from "../../../../core/index.ts";
import type { RecordingFlowActionCandidate } from "../../../../components/automation/importer/recording-mapper/index.ts";

export function recordingCandidateStateLinkMetadata(candidate: RecordingFlowActionCandidate): JsonObject {
  if (!candidate.stateLink) return {};
  return Object.fromEntries(Object.entries({
    stateLink: candidate.stateLink as unknown as JsonObject,
    stateSnapshotId: candidate.stateLink.stateSnapshotId,
    stateRef: candidate.stateLink.stateRef,
    screenshotRef: candidate.stateLink.screenshotRef
  }).filter(([, value]) => value !== undefined)) as JsonObject;
}
