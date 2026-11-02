import type { RecordingSession } from "../../../model/index.ts";
import { recordingEntryIndexedTimestamp as indexedTimestamp, recordingEntryObjectRefs as objectRefs } from "../../../../../runtime/recording/indexing/index.ts";
import { automationStudioRecordingIndexBuildPorts } from "./policy.ts";

export { recordingEntryObservationPayload, recordingEntryIsActionLike, recordingEntryActionId, recordingEntryActionType } from "../../../../../runtime/recording/indexing/index.ts";

export function recordingEntryIndexedTimestamp(entry: RecordingSession["timeline"][number]): number | undefined {
  return indexedTimestamp(entry, automationStudioRecordingIndexBuildPorts.observations);
}

export function recordingEntryObjectRefs(projectId: string, entry: RecordingSession["timeline"][number]): string[] {
  return objectRefs(projectId, entry, automationStudioRecordingIndexBuildPorts.references);
}
