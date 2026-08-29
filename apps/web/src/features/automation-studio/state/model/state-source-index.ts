import type { EvidenceAnchor, EvidenceReference, NodeEvidenceBinding, NodeEvidenceRole, NodeStatePhase, NodeStateRuntimeComparison, NodeStateSource, StateFact, StateSnapshot, StateValue, StateVisualFrame } from "fluxiq/automation-studio";
import type { AutomationSelection } from "../../shared/selection-contracts";
import type { BuildNodeStateViewModelInput, NodeEvidenceBindingViewModel, NodeStateRuntimeComparisonRow, NodeStateRuntimeComparisonViewModel, NodeStateViewModel, ResolvedActionVisualTargetViewModel, StateDiffRow, StateFactViewModel, StateOverlayTone, StateOverlayViewModel, StateSourceRecord, StateStructuredRow, StateVisualTone } from "./types";
import { nodeEvidenceReferenceIds } from "./evidence-bindings";
import { selectionRecord } from "./state-selection";
import { arrayValue, compactObject, isObjectRecord, isStateSnapshot, isString, numberValue, objectRecord, shortId, stringValue } from "./value-utils";

export function collectStateSources(input: BuildNodeStateViewModelInput, nodeId: string): StateSourceRecord[] {
  const records: StateSourceRecord[] = [];
  const seen = new Set<string>();
  const add = (record: StateSourceRecord) => {
    if (seen.has(record.source.id)) return;
    seen.add(record.source.id);
    records.push(record);
  };

  for (const source of input.indexedStateSources ?? []) {
    add({ source: source.source, snapshot: source.snapshot, deltas: [], raw: source.raw ?? source.snapshot });
  }
  for (const learned of learnedSources(input.pipelineArtifacts, nodeId)) add(learned);
  for (const source of observedTimelineSources(input)) {
    const timelineEntries = arrayValue(source.timeline?.timeline ?? source.recording?.timeline);
    for (const [index, entry] of timelineEntries.entries()) {
      const entryRecord = objectRecord(entry);
      const snapshot = stateSnapshotFromTimelineEntry(entryRecord);
      if (snapshot && entryRecord) {
        const recordingId = stringValue(entryRecord.recordingId) ?? source.recordingId;
        const entryId = stringValue(entryRecord.id);
        add({
          source: {
            kind: "observed",
            id: `observed:${recordingId}:${entryId ?? index}`,
            label: entryId ? `Recording ${shortId(recordingId)} @ ${shortId(entryId)}` : `Recording ${shortId(recordingId)}`,
            recordingId,
            ...(entryId ? { timelineEntryId: entryId } : {}),
            timestamp: numberValue(entryRecord.timestamp) ?? snapshot.timestamp
          },
          snapshot,
          deltas: [],
          raw: entryRecord
        });
      }
    }
    const initialState = source.timeline && isStateSnapshot(source.timeline.initialState)
      ? source.timeline.initialState
      : source.recording && isStateSnapshot(source.recording.initialState) ? source.recording.initialState : null;
    if (initialState) {
      add({
        source: {
          kind: "observed",
          id: `observed:${source.recordingId}:initial`,
          label: `Recording ${shortId(source.recordingId)} initial`,
          recordingId: source.recordingId,
          timestamp: initialState.timestamp
        },
        snapshot: initialState,
        deltas: [],
        raw: source.recording ?? source.timeline
      });
    }
  }
  for (const runtime of runtimeSources(input.runtimeSessions)) add(runtime);
  return records;
}

export function observedTimelineSources(input: BuildNodeStateViewModelInput): Array<{ recordingId: string; recording?: Record<string, unknown>; timeline?: Record<string, unknown> }> {
  const requestedRecordingIds = new Set<string>();
  const selection = selectionRecord(input.selection);
  const sourceRecordingId = recordingIdFromObservedSourceId(input.viewState?.sourceId ?? selection.sourceId);
  if (selection.recordingId) requestedRecordingIds.add(selection.recordingId);
  if (sourceRecordingId) requestedRecordingIds.add(sourceRecordingId);

  const selectedRecording = objectRecord(input.selectedRecording);
  const selectedTimeline = objectRecord(input.selectedTimeline);
  const selectedRecordingId = stringValue(selectedRecording?.recordingId) ?? stringValue(selectedTimeline?.recordingId);
  if (!requestedRecordingIds.size && selectedRecordingId) requestedRecordingIds.add(selectedRecordingId);

  const recordings = arrayValue(input.recordings).map(objectRecord).filter((record): record is Record<string, unknown> => Boolean(record));
  const timelines = arrayValue(input.timelines).map(objectRecord).filter((record): record is Record<string, unknown> => Boolean(record));
  const candidates: Array<{ recordingId: string; recording?: Record<string, unknown>; timeline?: Record<string, unknown> }> = [];
  const add = (recordingId: string | undefined, recording?: Record<string, unknown>, timeline?: Record<string, unknown>) => {
    if (!recordingId || candidates.some((candidate) => candidate.recordingId === recordingId)) return;
    candidates.push(compactObject({ recordingId, recording, timeline }) as { recordingId: string; recording?: Record<string, unknown>; timeline?: Record<string, unknown> });
  };

  for (const recordingId of requestedRecordingIds) {
    add(recordingId, recordings.find((recording) => stringValue(recording.recordingId) === recordingId) ?? (selectedRecordingId === recordingId ? selectedRecording ?? undefined : undefined), timelines.find((timeline) => stringValue(timeline.recordingId) === recordingId) ?? (selectedRecordingId === recordingId ? selectedTimeline ?? undefined : undefined));
  }
  add(selectedRecordingId, selectedRecording ?? undefined, selectedTimeline ?? undefined);
  if (!candidates.length && (selectedRecording || selectedTimeline)) add(selectedRecordingId ?? "recording", selectedRecording ?? undefined, selectedTimeline ?? undefined);
  return candidates;
}

export function learnedSources(artifacts: unknown, nodeId: string): StateSourceRecord[] {
  if (!nodeId) return [];
  const artifactRecord = objectRecord(artifacts);
  const models = arrayValue(artifactRecord?.learnedTaskModels);
  return models.flatMap((model) => {
    const modelRecord = objectRecord(model);
    if (!modelRecord) return [];
    const clusters = arrayValue(modelRecord.actionClusters);
    const matchingCluster = clusters.find((cluster) => {
      const clusterRecord = objectRecord(cluster);
      return stringValue(clusterRecord?.id) === nodeId || stringValue(objectRecord(clusterRecord?.metadata)?.nodeId) === nodeId;
    });
    if (!matchingCluster) return [];
    const recordingIds = arrayValue(modelRecord.sourceRecordings).map(stringValue).filter(isString);
    return [{
      source: compactObject({
        kind: "learned" as const,
        id: `learned:${stringValue(modelRecord.learnedTaskModelId) ?? "model"}:${nodeId}`,
        label: "Learned",
        modelId: stringValue(modelRecord.learnedTaskModelId),
        nodeId,
        recordingIds,
        confidence: numberValue(objectRecord(matchingCluster)?.confidence)
      }) as NodeStateSource,
      snapshot: null,
      deltas: [],
      raw: matchingCluster
    }];
  });
}

export function runtimeSources(runtimeSessions: unknown[]): StateSourceRecord[] {
  return runtimeSessions.flatMap((session) => {
    const record = objectRecord(session);
    if (!record) return [];
    const state = firstStateSnapshot(record.metadata, record.trace, record.currentState, record.state);
    if (!state) return [];
    const runId = stringValue(record.runId) ?? "runtime";
    return [{
      source: {
        kind: "runtime" as const,
        id: `runtime:${runId}`,
        label: `Live ${shortId(runId)}`,
        sessionId: runId,
        timestamp: state.timestamp
      },
      snapshot: state,
      deltas: [],
      raw: record
    }];
  });
}

export function stateSnapshotFromTimelineEntry(entryRecord: Record<string, unknown> | null | undefined): StateSnapshot | null {
  if (!entryRecord) return null;
  if (entryRecord.type === "state_checkpoint" && isStateSnapshot(entryRecord.state)) return entryRecord.state;
  if (entryRecord.type === "observation" && entryRecord.observationType === "client.state_snapshot") {
    const payload = objectRecord(entryRecord.payload);
    if (isStateSnapshot(payload?.state)) return payload.state;
  }
  return null;
}

export function firstStateSnapshot(...values: unknown[]): StateSnapshot | null {
  for (const value of values) {
    if (isStateSnapshot(value)) return value;
    const record = objectRecord(value);
    if (!record) continue;
    for (const candidate of Object.values(record)) {
      if (isStateSnapshot(candidate)) return candidate;
    }
  }
  return null;
}

export function inferPreferredObservedSourceId(input: BuildNodeStateViewModelInput, sourceRecords: StateSourceRecord[], bindings: NodeEvidenceBinding[], nodeId: string): string | undefined {
  const observedSources = sourceRecords.filter((record) => record.source.kind === "observed" && record.snapshot);
  if (!observedSources.length) return undefined;
  const selectedEntryId = selectedTimelineEntryId(input.selection) ?? stringValue(objectRecord(input.selectedEntry)?.id);
  if (selectedEntryId) {
    const exact = observedSources.find((record) => record.source.kind === "observed" && record.source.timelineEntryId === selectedEntryId);
    if (exact) return exact.source.id;
    const timing = timelineEntryTiming(input, selectedEntryId);
    if (timing) {
      const nearest = nearestObservedSourceForTiming(observedSources, timing);
      if (nearest) return nearest.source.id;
    }
  }
  const references = collectNodeStateEntryReferences(input, bindings);
  const actionOffsets = [...references.actionEntryIds]
    .map((entryId) => timelineEntryTiming(input, entryId))
    .filter((timing): timing is { offset?: number; timestamp?: number } => Boolean(timing));
  for (const timing of actionOffsets) {
    const nearest = nearestObservedSourceForTiming(observedSources, timing);
    if (nearest) return nearest.source.id;
  }
  for (const entryId of references.snapshotEntryIds) {
    const exact = observedSources.find((record) => record.source.kind === "observed" && record.source.timelineEntryId === entryId);
    if (exact) return exact.source.id;
  }
  for (const entryId of references.supportEntryIds) {
    const exact = observedSources.find((record) => record.source.kind === "observed" && record.source.timelineEntryId === entryId);
    if (exact) return exact.source.id;
  }
  const orderedActionTiming = inferNodeOrderActionTiming(input, nodeId);
  if (orderedActionTiming) {
    const nearest = nearestObservedSourceForTiming(observedSources, orderedActionTiming);
    if (nearest) return nearest.source.id;
  }
  return undefined;
}

export function collectNodeStateEntryReferences(input: BuildNodeStateViewModelInput, bindings: NodeEvidenceBinding[]) {
  const snapshotEntryIds = new Set<string>();
  const supportEntryIds = new Set<string>();
  const actionEntryIds = new Set<string>();
  const correlationIds = new Set<string>();
  const addEvidence = (value: unknown) => {
    const record = objectRecord(value);
    if (!record) return;
    const entryId = stringValue(record.entryId);
    const observationId = stringValue(record.observationId);
    const artifactId = stringValue(record.artifactId);
    const layer = stringValue(record.layer);
    if (artifactId?.startsWith("corr.")) correlationIds.add(artifactId);
    if (layer === "state_action_correlation" && artifactId) correlationIds.add(artifactId);
    if (observationId && timelineEntryIsStateSnapshot(input, observationId)) snapshotEntryIds.add(observationId);
    if (entryId) {
      if (timelineEntryIsStateSnapshot(input, entryId)) snapshotEntryIds.add(entryId);
      else if (layer === "recording" || layer === "raw_recording" || observationId) actionEntryIds.add(entryId);
      else supportEntryIds.add(entryId);
    }
    if (observationId && !timelineEntryIsStateSnapshot(input, observationId)) snapshotEntryIds.add(observationId);
  };

  const selectedNode = objectRecord(input.selectedNode);
  const nodeMetadata = objectRecord(selectedNode?.metadata);
  [
    ...arrayValue(selectedNode?.sourceEvidence),
    ...arrayValue(selectedNode?.evidence),
    ...arrayValue(nodeMetadata?.sourceEvidence),
    ...arrayValue(nodeMetadata?.evidence),
    ...bindings.flatMap((binding) => binding.provenance ?? [])
  ].forEach(addEvidence);

  for (const binding of bindings) {
    const artifactId = stringValue(binding.fact.evidence?.artifactId);
    if (artifactId?.startsWith("corr.")) correlationIds.add(artifactId);
    if (binding.fact.evidence) addEvidence(binding.fact.evidence);
  }

  const artifacts = objectRecord(input.pipelineArtifacts);
  for (const correlation of arrayValue(artifacts?.stateActionCorrelations).filter(isObjectRecord)) {
    const correlationId = stringValue(correlation.correlationId);
    if (correlationIds.size && correlationId && !correlationIds.has(correlationId)) continue;
    if (!correlationIds.size && !nodeEvidenceReferenceIds(input.selectedNode).has(correlationId ?? "")) continue;
    const actionEntryId = stringValue(correlation.actionEntryId);
    if (actionEntryId) actionEntryIds.add(actionEntryId);
    for (const support of arrayValue(correlation.support)) {
      const entryId = stringValue(objectRecord(support)?.entryId);
      if (entryId) supportEntryIds.add(entryId);
    }
  }

  return { snapshotEntryIds, supportEntryIds, actionEntryIds };
}

export function nearestObservedSourceForTiming(observedSources: StateSourceRecord[], timing: { offset?: number; timestamp?: number }): StateSourceRecord | undefined {
  const scored = observedSources
    .map((record) => {
      const recordTiming = sourceRecordTiming(record);
      const delta = timing.timestamp !== undefined && recordTiming.timestamp !== undefined
        ? timing.timestamp - recordTiming.timestamp
        : timing.offset !== undefined && recordTiming.offset !== undefined ? timing.offset - recordTiming.offset : Number.POSITIVE_INFINITY;
      return { record, delta };
    })
    .filter((item) => Number.isFinite(item.delta))
    .sort((left, right) => {
      const distance = Math.abs(left.delta) - Math.abs(right.delta);
      if (distance !== 0) return distance;
      const leftBefore = left.delta >= 0;
      const rightBefore = right.delta >= 0;
      if (leftBefore !== rightBefore) return leftBefore ? -1 : 1;
      return 0;
    });
  return scored[0]?.record;
}

export function sourceRecordTiming(record: StateSourceRecord): { offset?: number; timestamp?: number } {
  const raw = objectRecord(record.raw);
  const payload = objectRecord(raw?.payload);
  const metadata = objectRecord(payload?.metadata);
  const result: { offset?: number; timestamp?: number } = {};
  const offset = numberValue(raw?.monotonicOffsetMs);
  const timestamp = numberValue(metadata?.eventTimestampMs)
    ?? numberValue(metadata?.stateTimestampMs)
    ?? numberValue(raw?.startedAt)
    ?? numberValue(raw?.timestamp)
    ?? record.snapshot?.timestamp
    ?? (record.source.kind !== "learned" ? record.source.timestamp : undefined);
  if (offset !== undefined) result.offset = offset;
  if (timestamp !== undefined) result.timestamp = timestamp;
  return result;
}

export function timelineEntryTiming(input: BuildNodeStateViewModelInput, entryId: string): { offset?: number; timestamp?: number } | null {
  const entry = timelineEntryRecord(input, entryId);
  if (!entry) return null;
  const result: { offset?: number; timestamp?: number } = {};
  const offset = numberValue(entry.monotonicOffsetMs);
  const timestamp = numberValue(entry.startedAt) ?? numberValue(entry.completedAt) ?? numberValue(entry.timestamp);
  if (offset !== undefined) result.offset = offset;
  if (timestamp !== undefined) result.timestamp = timestamp;
  return result;
}

export function timelineEntryRecord(input: BuildNodeStateViewModelInput, entryId: string): Record<string, unknown> | null {
  return observedTimelineSources(input)
    .flatMap((source) => arrayValue(source.timeline?.timeline ?? source.recording?.timeline))
    .map(objectRecord)
    .find((record) => record?.id === entryId) ?? null;
}

export function timelineEntryIsStateSnapshot(input: BuildNodeStateViewModelInput, entryId: string): boolean {
  return Boolean(stateSnapshotFromTimelineEntry(timelineEntryRecord(input, entryId)));
}

export function selectedTimelineEntryId(selection: AutomationSelection | null): string | undefined {
  if (selection?.kind === "timeline") return selection.id;
  if (selection?.kind === "state") return selection.timelineEntryId;
  return undefined;
}

export function inferNodeOrderActionTiming(input: BuildNodeStateViewModelInput, nodeId: string): { offset?: number; timestamp?: number } | null {
  if (!nodeId) return null;
  const nodes = orderedPolicyNodes(input);
  const nodeIndex = nodes.findIndex((node) => stringValue(node.id) === nodeId);
  if (nodeIndex < 0) return null;
  const actionEntries = selectedTimelineEntries(input)
    .map(objectRecord)
    .filter((entry): entry is Record<string, unknown> => Boolean(entry && isActionLikeTimelineEntry(entry)));
  if (!actionEntries.length || nodeIndex >= actionEntries.length) return null;
  return timingFromRecord(actionEntries[nodeIndex]!);
}

export function orderedPolicyNodes(input: BuildNodeStateViewModelInput): Array<Record<string, unknown>> {
  for (const source of [input.policy, input.taskGraph]) {
    const record = objectRecord(source);
    const nodes = arrayValue(record?.nodes).map(objectRecord).filter((node): node is Record<string, unknown> => Boolean(node && stringValue(node.id)));
    if (nodes.length) return nodes;
    const graphNodes = arrayValue(objectRecord(record?.graph)?.nodes).map(objectRecord).filter((node): node is Record<string, unknown> => Boolean(node && stringValue(node.id)));
    if (graphNodes.length) return graphNodes;
  }
  return [];
}

export function selectedTimelineEntries(input: BuildNodeStateViewModelInput): unknown[] {
  const selectedTimeline = objectRecord(input.selectedTimeline);
  const selectedRecording = objectRecord(input.selectedRecording);
  return arrayValue(selectedTimeline?.timeline ?? selectedRecording?.timeline);
}

export function isActionLikeTimelineEntry(entry: Record<string, unknown>): boolean {
  const type = stringValue(entry.type);
  if (type === "action" || type === "client_action" || type === "recorded_action" || type === "interaction") return true;
  if (stringValue(entry.actionType)) return true;
  if (objectRecord(entry.action)) return true;
  return false;
}

export function timingFromRecord(record: Record<string, unknown>): { offset?: number; timestamp?: number } | null {
  const result: { offset?: number; timestamp?: number } = {};
  const offset = numberValue(record.monotonicOffsetMs);
  const timestamp = numberValue(record.startedAt) ?? numberValue(record.completedAt) ?? numberValue(record.timestamp);
  if (offset !== undefined) result.offset = offset;
  if (timestamp !== undefined) result.timestamp = timestamp;
  return result.offset !== undefined || result.timestamp !== undefined ? result : null;
}

export function stateSourceSnapshotId(source: NodeStateSource): string | undefined {
  const record = source as unknown as Record<string, unknown>;
  return stringValue(record.stateSnapshotId);
}

export function recordingIdFromObservedSourceId(sourceId: string | undefined): string | undefined {
  if (!sourceId) return undefined;
  const match = /^observed:([^:]+):/.exec(sourceId);
  return match?.[1];
}
