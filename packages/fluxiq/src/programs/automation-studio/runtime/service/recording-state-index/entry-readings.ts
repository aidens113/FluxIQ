import type { JsonObject } from "../../../../../core/index.ts";
import type { RecordingSession } from "../../../model/index.ts";
import { parseAutomationStudioObjectContentRef } from "../../../storage/index.ts";
import { isJsonRecord } from "../json-values.ts";
import { isStateSnapshotObject } from "../object-documents.ts";
import { firstFiniteNumber } from "../scalar-readings/index.ts";

// Reading the indexable facts out of one recording timeline entry: what kind
// of entry it is, when it happened, and which stored objects it refers to.

export function recordingEntryObservationPayload(entry: RecordingSession["timeline"][number]): JsonObject {
  return entry.type === "observation" && isJsonRecord(entry.payload) ? entry.payload : {};
}

export function recordingEntryIsActionLike(entry: RecordingSession["timeline"][number]): boolean {
  const record = entry as unknown as Record<string, unknown>;
  const type = typeof record.type === "string" ? record.type : "";
  if (type === "action" || type === "client_action" || type === "recorded_action" || type === "interaction") return true;
  if (typeof record.actionType === "string" && record.actionType.trim()) return true;
  if (record.action && typeof record.action === "object" && !Array.isArray(record.action)) return true;
  return false;
}

export function recordingEntryActionId(entry: RecordingSession["timeline"][number]): string | undefined {
  return recordingEntryIsActionLike(entry) ? `action.${entry.id}` : undefined;
}

export function recordingEntryActionType(entry: RecordingSession["timeline"][number]): string {
  if (typeof (entry as { actionType?: unknown }).actionType === "string" && (entry as { actionType: string }).actionType.trim()) return (entry as { actionType: string }).actionType.trim();
  if (typeof (entry as { eventType?: unknown }).eventType === "string" && (entry as { eventType: string }).eventType.trim()) return (entry as { eventType: string }).eventType.trim();
  if (typeof (entry as { outputId?: unknown }).outputId === "string" && (entry as { outputId: string }).outputId.trim()) return (entry as { outputId: string }).outputId.trim();
  return entry.type;
}

export function recordingEntryIndexedTimestamp(entry: RecordingSession["timeline"][number]): number | undefined {
  const payload = recordingEntryObservationPayload(entry);
  const payloadMetadata = isJsonRecord(payload.metadata) ? payload.metadata : {};
  const entryMetadata = isJsonRecord((entry as { metadata?: unknown }).metadata) ? (entry as { metadata: JsonObject }).metadata : {};
  const payloadState = isStateSnapshotObject(payload.state) ? payload.state : undefined;
  return firstFiniteNumber(
    entryMetadata.eventTimestampMs,
    entryMetadata.actionTimestampMs,
    entryMetadata.stateTimestampMs,
    payloadMetadata.eventTimestampMs,
    payloadMetadata.actionTimestampMs,
    payloadMetadata.stateTimestampMs,
    payloadMetadata.stateSnapshotTimestamp,
    payload.eventTimestampMs,
    payload.actionTimestampMs,
    payload.stateTimestampMs,
    payload.stateSnapshotTimestamp,
    payloadState?.timestamp,
    entry.timestamp
  );
}

export function recordingEntryObjectRefs(projectId: string, entry: RecordingSession["timeline"][number]): string[] {
  const refs = new Set<string>();
  const addRef = (value: unknown) => {
    if (typeof value !== "string") return;
    const parsed = parseAutomationStudioObjectContentRef(value);
    if (parsed?.projectId === projectId) refs.add(value);
  };
  const payload = recordingEntryObservationPayload(entry);
  addRef(payload.stateRef);
  addRef(payload.screenshotRef);
  const metadata = isJsonRecord(payload.metadata) ? payload.metadata : {};
  addRef(metadata.screenshotRef);
  addRefsFromValue(refs, payload, projectId);
  addRefsFromValue(refs, (entry as { metadata?: unknown }).metadata, projectId);
  return [...refs].sort();
}

function addRefsFromValue(refs: Set<string>, value: unknown, projectId: string, seen = new Set<unknown>()): void {
  if (value === null || value === undefined) return;
  if (typeof value === "string") {
    const parsed = parseAutomationStudioObjectContentRef(value);
    if (parsed?.projectId === projectId) refs.add(value);
    return;
  }
  if (typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) addRefsFromValue(refs, item, projectId, seen);
    return;
  }
  for (const item of Object.values(value)) addRefsFromValue(refs, item, projectId, seen);
}
