import type { JsonObject } from "../../../../../core/index.ts";
import type { RecordingSession } from "../../../model/index.ts";
import type { RecordingStateIndexItem } from "../../../storage/index.ts";
import { isJsonRecord } from "../json-values.ts";
import { firstString } from "../scalar-readings/index.ts";
import { recordingEntryIndexedTimestamp, recordingEntryObjectRefs, recordingEntryObservationPayload } from "./entry-readings.ts";

// Which timeline entries carry a state snapshot, which snapshot an entry is
// linked to, and the index item a snapshot entry becomes.

export function recordingEntryIsStateSnapshot(entry: RecordingSession["timeline"][number]): boolean {
  return entry.type === "observation" && entry.observationType === "client.state_snapshot";
}

export function recordingEntryStateSnapshotId(entry: RecordingSession["timeline"][number]): string | undefined {
  if (!recordingEntryIsStateSnapshot(entry)) {
    return recordingEntryExplicitStateSnapshotId(entry);
  }
  const payload = recordingEntryObservationPayload(entry);
  const metadata = isJsonRecord(payload.metadata) ? payload.metadata : {};
  return firstString(payload.snapshotId, metadata.stateSnapshotId, metadata.snapshotId, entry.correlationId, `state.${entry.id}`);
}

export function recordingEntryExplicitStateSnapshotId(entry: RecordingSession["timeline"][number]): string | undefined {
  const metadata = isJsonRecord((entry as { metadata?: unknown }).metadata) ? (entry as { metadata: JsonObject }).metadata : {};
  return firstString(metadata.stateSnapshotId, metadata.stateAtActionId);
}

export function recordingEntryStateIndexItem(projectId: string, entry: RecordingSession["timeline"][number], stateSnapshotId: string): RecordingStateIndexItem | null {
  const payload = recordingEntryObservationPayload(entry);
  const stateRef = typeof payload.stateRef === "string" ? payload.stateRef : undefined;
  if (!stateRef) return null;
  const metadata = isJsonRecord(payload.metadata) ? payload.metadata : {};
  const screenshotRef = firstString(metadata.screenshotRef, payload.screenshotRef);
  const visualFrameId = firstString(metadata.visualFrameId, payload.visualFrameId);
  const coordinateSpace = coordinateSpaceFromValue(metadata.coordinateSpace);
  const refs = new Set<string>([stateRef, ...recordingEntryObjectRefs(projectId, entry)]);
  if (screenshotRef) refs.add(screenshotRef);
  return {
    stateSnapshotId,
    entryId: entry.id,
    timestamp: recordingEntryIndexedTimestamp(entry) ?? Date.now(),
    ...(typeof (entry as { monotonicOffsetMs?: unknown }).monotonicOffsetMs === "number" ? { monotonicOffsetMs: (entry as { monotonicOffsetMs: number }).monotonicOffsetMs } : {}),
    stateRef,
    ...(screenshotRef ? { screenshotRef } : {}),
    ...(visualFrameId ? { visualFrameId } : {}),
    ...(coordinateSpace ? { coordinateSpace } : {}),
    objectRefs: [...refs].sort(),
    linkedActionIds: []
  };
}

function coordinateSpaceFromValue(value: unknown): RecordingStateIndexItem["coordinateSpace"] | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  return typeof record.width === "number"
    && typeof record.height === "number"
    && record.unit === "px"
    && record.origin === "top-left"
    ? { width: record.width, height: record.height, unit: "px", origin: "top-left" }
    : undefined;
}
