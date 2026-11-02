import type { RecordingIndexBuildPorts, RecordingIndexObservationPolicy } from "../../../../../runtime/recording/indexing/index.ts";
import { automationStudioRecordingReferenceReader } from "../../../storage/recording-index-policy/index.ts";
import { isStateSnapshotObject } from "../object-documents.ts";

export const automationStudioRecordingIndexObservationPolicy: RecordingIndexObservationPolicy = {
  isSnapshot(entry) {
    return entry.observationType === "client.state_snapshot";
  },
  embeddedState(entry) {
    const state = entry.payload?.state;
    return isStateSnapshotObject(state) ? state : undefined;
  }
};

export const automationStudioRecordingIndexBuildPorts: RecordingIndexBuildPorts = {
  references: automationStudioRecordingReferenceReader,
  observations: automationStudioRecordingIndexObservationPolicy,
  now: () => Date.now()
};
