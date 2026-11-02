import type { RecordingStateIndexItem } from "@fluxiq/contracts/recording";
import { recordingEntryIsStateSnapshot as isSnapshot, recordingEntryStateSnapshotId as snapshotId, recordingEntryStateIndexItem as stateItem } from "../../../../../runtime/recording/indexing/index.ts";
import type { RecordingSession } from "../../../model/index.ts";
import { automationStudioRecordingIndexBuildPorts } from "./policy.ts";

export { recordingEntryExplicitStateSnapshotId } from "../../../../../runtime/recording/indexing/index.ts";

export function recordingEntryIsStateSnapshot(entry: RecordingSession["timeline"][number]): boolean {
  return isSnapshot(entry, automationStudioRecordingIndexBuildPorts.observations);
}

export function recordingEntryStateSnapshotId(entry: RecordingSession["timeline"][number]): string | undefined {
  return snapshotId(entry, automationStudioRecordingIndexBuildPorts.observations);
}

export function recordingEntryStateIndexItem(projectId: string, entry: RecordingSession["timeline"][number], stateSnapshotId: string): RecordingStateIndexItem | null {
  return stateItem(projectId, entry, stateSnapshotId, automationStudioRecordingIndexBuildPorts);
}
