export function stringRecordValue(record: Record<string, unknown> | null | undefined, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function firstNonEmptyString(values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export function selectedNodeActionPreviewEntryId(recordingOrTimeline: any, selectedNode: any): string | null {
  const metadata = selectedNode && typeof selectedNode === "object" && !Array.isArray(selectedNode) && selectedNode.metadata && typeof selectedNode.metadata === "object" && !Array.isArray(selectedNode.metadata)
    ? selectedNode.metadata as Record<string, unknown>
    : null;
  const directEntryId = stringRecordValue(metadata, "actionEntryId") ?? stringRecordValue(metadata, "timelineEntryId");
  const directPreviewId = resolveActionPreviewEntryId(recordingOrTimeline, directEntryId);
  if (directPreviewId) return directPreviewId;

  const stateSnapshotId = stringRecordValue(metadata, "stateSnapshotId") ?? stringRecordValue(metadata, "stateAtActionId");
  if (!stateSnapshotId) return null;
  const entries = Array.isArray(recordingOrTimeline?.timeline) ? recordingOrTimeline.timeline.filter((entry: any) => entry && typeof entry === "object") : [];
  const stateEntry = entries.find((entry: any) => timelineEntryStateSnapshotId(entry) === stateSnapshotId);
  return resolveActionPreviewEntryId(recordingOrTimeline, stateEntry?.id);
}

export function resolveObservedStateEntryId(recording: any, timelineEntryId: string): string | null {
  const entries = Array.isArray(recording?.timeline) ? recording.timeline.filter((entry: any) => entry && typeof entry === "object") : [];
  if (!entries.length) return null;
  const requested = entries.find((entry: any) => entry.id === timelineEntryId);
  if (isStateSnapshotTimelineEntry(requested)) return String(requested.id);
  const targetTiming = timelineEntryComparableTimestamp(requested);
  if (targetTiming === null) return null;
  const candidates = entries
    .filter(isStateSnapshotTimelineEntry)
    .map((entry: any) => ({ entry, delta: targetTiming - (timelineEntryComparableTimestamp(entry) ?? Number.POSITIVE_INFINITY) }))
    .filter((item: { entry: any; delta: number }) => Number.isFinite(item.delta))
    .sort((left: { entry: any; delta: number }, right: { entry: any; delta: number }) => {
      const distance = Math.abs(left.delta) - Math.abs(right.delta);
      if (distance !== 0) return distance;
      const leftBefore = left.delta >= 0;
      const rightBefore = right.delta >= 0;
      if (leftBefore !== rightBefore) return leftBefore ? -1 : 1;
      return 0;
    });
  return candidates[0]?.entry?.id ? String(candidates[0].entry.id) : null;
}

export function resolveActionPreviewEntryId(recordingOrTimeline: any, timelineEntryId: string | null | undefined): string | null {
  if (!timelineEntryId) return null;
  const entries = Array.isArray(recordingOrTimeline?.timeline) ? recordingOrTimeline.timeline.filter((entry: any) => entry && typeof entry === "object") : [];
  if (!entries.length) return timelineEntryId;
  const requested = entries.find((entry: any) => entry.id === timelineEntryId);
  if (isActionTimelineEntry(requested)) return String(requested.id);
  const metadata = requested?.payload && typeof requested.payload === "object" ? requested.payload.metadata : null;
  const metadataActionEntryId = metadata && typeof metadata === "object" && typeof metadata.actionEntryId === "string" ? metadata.actionEntryId : undefined;
  if (metadataActionEntryId && entries.some((entry: any) => entry.id === metadataActionEntryId && isActionTimelineEntry(entry))) return metadataActionEntryId;
  const targetTiming = timelineEntryComparableTimestamp(requested);
  if (targetTiming === null) return null;
  const candidates = entries
    .filter(isActionTimelineEntry)
    .map((entry: any) => ({ entry, delta: targetTiming - (timelineEntryComparableTimestamp(entry) ?? Number.POSITIVE_INFINITY) }))
    .filter((item: { entry: any; delta: number }) => Number.isFinite(item.delta))
    .sort((left: { entry: any; delta: number }, right: { entry: any; delta: number }) => {
      const distance = Math.abs(left.delta) - Math.abs(right.delta);
      if (distance !== 0) return distance;
      const leftBefore = left.delta >= 0;
      const rightBefore = right.delta >= 0;
      if (leftBefore !== rightBefore) return leftBefore ? -1 : 1;
      return 0;
    });
  return candidates[0]?.entry?.id ? String(candidates[0].entry.id) : null;
}

function isActionTimelineEntry(entry: any): boolean {
  return Boolean(entry && typeof entry === "object" && (entry.type === "action" || entry.type === "domain_event"));
}

function isStateSnapshotTimelineEntry(entry: any): boolean {
  return Boolean(entry && typeof entry === "object" && (
    entry.type === "state_checkpoint"
    || (entry.type === "observation" && entry.observationType === "client.state_snapshot")
  ));
}

function timelineEntryStateSnapshotId(entry: any): string | null {
  if (!entry || typeof entry !== "object") return null;
  const payload = entry.payload && typeof entry.payload === "object" ? entry.payload as Record<string, unknown> : null;
  const payloadMetadata = payload?.metadata && typeof payload.metadata === "object" && !Array.isArray(payload.metadata) ? payload.metadata as Record<string, unknown> : null;
  const entryMetadata = entry.metadata && typeof entry.metadata === "object" && !Array.isArray(entry.metadata) ? entry.metadata as Record<string, unknown> : null;
  return firstNonEmptyString([
    entry.stateSnapshotId,
    payload?.stateSnapshotId,
    payload?.snapshotId,
    stringRecordValue(payloadMetadata, "stateSnapshotId"),
    stringRecordValue(payloadMetadata, "snapshotId"),
    stringRecordValue(entryMetadata, "stateSnapshotId"),
    stringRecordValue(entryMetadata, "stateAtActionId")
  ]);
}

function timelineEntryComparableTimestamp(entry: any): number | null {
  if (!entry || typeof entry !== "object") return null;
  const metadata = entry.payload && typeof entry.payload === "object" ? entry.payload.metadata : null;
  for (const value of [
    metadata && typeof metadata === "object" ? metadata.eventTimestampMs : undefined,
    metadata && typeof metadata === "object" ? metadata.stateTimestampMs : undefined,
    entry.startedAt,
    entry.completedAt,
    entry.timestamp,
    entry.monotonicOffsetMs
  ]) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

export function latestProposalForRecordingId(recordingId: string | null | undefined, proposals: any[], recordingFlowProposals: any[]): any | undefined {
  if (!recordingId) return undefined;
  return latestByGeneratedAt<any>([
    ...proposals.filter((item: any) => item.recordingId === recordingId || item.metadata?.recordingId === recordingId),
    ...recordingFlowProposals.filter((item: any) => item.recordingId === recordingId || item.metadata?.recordingId === recordingId)
  ]);
}

export function latestByGeneratedAt<TItem extends { generatedAt?: number }>(items: TItem[]): TItem | undefined {
  return [...items].sort((left, right) => (right.generatedAt ?? 0) - (left.generatedAt ?? 0))[0];
}
