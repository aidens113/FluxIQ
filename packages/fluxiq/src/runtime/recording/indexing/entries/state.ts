import type { JsonObject } from "@fluxiq/contracts/core";
import type { RecordingStateIndexItem, TimelineEntry } from "@fluxiq/contracts/recording";
import type { RecordingIndexBuildPorts, RecordingIndexObservationPolicy } from "../policy/index.ts";
import { recordingEntryObjectRefs } from "./refs.ts";
import { recordingEntryIndexedTimestamp, recordingEntryObservationPayload } from "./timestamp.ts";

export function recordingEntryIsStateSnapshot(entry: TimelineEntry<unknown, unknown>, observations: RecordingIndexObservationPolicy): boolean {
  return entry.type === "observation" && observations.isSnapshot(entry);
}

export function recordingEntryStateSnapshotId(entry: TimelineEntry<unknown, unknown>, observations: RecordingIndexObservationPolicy): string | undefined {
  if (!recordingEntryIsStateSnapshot(entry, observations)) return recordingEntryExplicitStateSnapshotId(entry);
  const payload = recordingEntryObservationPayload(entry);
  const metadata = isObject(payload.metadata) ? payload.metadata : {};
  return firstString(payload.snapshotId, metadata.stateSnapshotId, metadata.snapshotId, entry.correlationId, `state.${entry.id}`);
}

export function recordingEntryExplicitStateSnapshotId(entry: TimelineEntry<unknown, unknown>): string | undefined {
  const metadata = isObject(entry.metadata) ? entry.metadata : {};
  return firstString(metadata.stateSnapshotId, metadata.stateAtActionId);
}

export function recordingEntryStateIndexItem(projectId: string, entry: TimelineEntry<unknown, unknown>, stateSnapshotId: string, ports: RecordingIndexBuildPorts): RecordingStateIndexItem | null {
  const payload = recordingEntryObservationPayload(entry);
  const stateRef = typeof payload.stateRef === "string" ? payload.stateRef : undefined;
  if (!stateRef) return null;
  const metadata = isObject(payload.metadata) ? payload.metadata : {};
  const screenshotRef = firstString(metadata.screenshotRef, payload.screenshotRef);
  const visualFrameId = firstString(metadata.visualFrameId, payload.visualFrameId);
  const coordinateSpace = coordinateSpaceFromValue(metadata.coordinateSpace);
  const refs = new Set<string>([stateRef, ...recordingEntryObjectRefs(projectId, entry, ports.references)]);
  if (screenshotRef) refs.add(screenshotRef);
  const offset: Pick<RecordingStateIndexItem, "monotonicOffsetMs"> = {};
  const visual: Pick<RecordingStateIndexItem, "screenshotRef" | "visualFrameId" | "coordinateSpace"> = {};
  if (typeof entry.monotonicOffsetMs === "number") offset.monotonicOffsetMs = entry.monotonicOffsetMs;
  if (screenshotRef) visual.screenshotRef = screenshotRef;
  if (visualFrameId) visual.visualFrameId = visualFrameId;
  if (coordinateSpace) visual.coordinateSpace = coordinateSpace;
  return {
    stateSnapshotId,
    entryId: entry.id,
    timestamp: recordingEntryIndexedTimestamp(entry, ports.observations) ?? ports.now(),
    ...offset,
    stateRef,
    ...visual,
    objectRefs: [...refs].sort(),
    linkedActionIds: []
  };
}

function coordinateSpaceFromValue(value: unknown): RecordingStateIndexItem["coordinateSpace"] | undefined {
  if (!isObject(value)) return undefined;
  return typeof value.width === "number" && typeof value.height === "number" && value.unit === "px" && value.origin === "top-left"
    ? { width: value.width, height: value.height, unit: "px", origin: "top-left" }
    : undefined;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
