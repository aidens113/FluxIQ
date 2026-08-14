import type { NormalizedTimeline, NormalizationOptions, TimelineNormalizer } from "./contracts.ts";
import type { RecordingSession, StateSnapshot, TimelineEntry } from "../model/index.ts";
import { diffStateSnapshots } from "../model/index.ts";

const DEFAULT_STATE_CHECKPOINT_CONTEXT_WINDOW_MS = 2_000;

export class ConservativeTimelineNormalizer implements TimelineNormalizer {
  normalize(recording: RecordingSession, options: NormalizationOptions = {}): NormalizedTimeline {
    const issues: NormalizedTimeline["issues"] = [];
    const timeline: TimelineEntry[] = [];
    let previousCheckpoint: StateSnapshot = recording.initialState;
    let deltasSinceCheckpoint = 0;
    const checkpointPolicy = options.checkpointPolicy ?? {};
    const selectedStateContextEntryIds = selectActionContextStateEntryIds(recording.timeline, options);
    let compactedStateCheckpointCount = 0;
    let compactedStateObservationCount = 0;

    for (const entry of recording.timeline) {
      if (entry.type === "state_checkpoint") {
        if (!selectedStateContextEntryIds.has(entry.id)) {
          compactedStateCheckpointCount += 1;
          continue;
        }
        const deltas = diffStateSnapshots(previousCheckpoint, entry.state);
        if (deltas.length) {
          timeline.push({
            id: `${entry.id}.delta`,
            recordingId: recording.recordingId,
            timestamp: entry.timestamp,
            monotonicOffsetMs: entry.monotonicOffsetMs,
            sequence: timeline.length,
            sourceId: entry.sourceId,
            type: "state_delta",
            deltas,
            correlationId: entry.id,
            metadata: { normalizedFrom: entry.id }
          });
        }
        previousCheckpoint = entry.state;
        deltasSinceCheckpoint = 0;
        timeline.push({ ...entry, sequence: timeline.length });
        continue;
      }
      if (isHighFrequencyStateObservation(entry) && !selectedStateContextEntryIds.has(entry.id)) {
        compactedStateObservationCount += 1;
        continue;
      }
      if (entry.type === "state_delta") deltasSinceCheckpoint += entry.deltas.length;
      timeline.push({ ...entry, sequence: timeline.length });
      if (checkpointPolicy.maxDeltasBetweenCheckpoints && deltasSinceCheckpoint > checkpointPolicy.maxDeltasBetweenCheckpoints) {
        issues.push({
          severity: "info",
          code: "normalization.checkpoint_recommended",
          message: "A checkpoint is recommended after the configured number of state deltas.",
          entryId: entry.id
        });
        deltasSinceCheckpoint = 0;
      }
    }
    if (compactedStateCheckpointCount) {
      issues.push({
        severity: "info",
        code: "normalization.state_checkpoints_compacted",
        message: `${compactedStateCheckpointCount} high-frequency state checkpoint${compactedStateCheckpointCount === 1 ? " was" : "s were"} left in the raw recording and omitted from the normalized proposal timeline.`,
        metadata: { compactedStateCheckpointCount }
      });
    }
    if (compactedStateObservationCount) {
      issues.push({
        severity: "info",
        code: "normalization.state_observations_compacted",
        message: `${compactedStateObservationCount} high-frequency state observation${compactedStateObservationCount === 1 ? " was" : "s were"} left in the raw recording and omitted from the normalized proposal timeline.`,
        metadata: { compactedStateObservationCount }
      });
    }

    return {
      schemaVersion: "0.1",
      normalizedTimelineId: `timeline.${recording.recordingId}.normalized`,
      recordingId: recording.recordingId,
      ...(recording.taskId !== undefined ? { taskId: recording.taskId } : {}),
      sourceRecording: { layer: "raw_recording", artifactId: recording.recordingId },
      initialState: recording.initialState,
      timeline,
      issues,
      generatedAt: Date.now(),
      metadata: {
        ...(options.metadata ?? {}),
        ...(recording.environment.domainId !== undefined ? { domainId: recording.environment.domainId } : {}),
        normalizer: "conservative"
      }
    };
  }
}

export function normalizeRecordingTimeline(recording: RecordingSession, options?: NormalizationOptions): NormalizedTimeline {
  return new ConservativeTimelineNormalizer().normalize(recording, options);
}

export function selectActionContextStateCheckpointIds(entries: TimelineEntry[], options: Pick<NormalizationOptions, "compactStateCheckpoints" | "stateCheckpointContextWindowMs"> = {}): Set<string> {
  const selected = selectActionContextStateEntryIds(entries, options);
  return new Set(entries.filter((entry) => entry.type === "state_checkpoint" && selected.has(entry.id)).map((entry) => entry.id));
}

export function selectActionContextStateEntryIds(entries: TimelineEntry[], options: Pick<NormalizationOptions, "compactStateCheckpoints" | "stateCheckpointContextWindowMs"> = {}): Set<string> {
  const checkpoints = entries.filter((entry) => entry.type === "state_checkpoint" || isHighFrequencyStateObservation(entry));
  const selected = new Set<string>();
  for (const checkpoint of checkpoints) {
    if (options.compactStateCheckpoints === false) selected.add(checkpoint.id);
  }
  if (options.compactStateCheckpoints === false || checkpoints.length <= 2) return selected.size ? selected : new Set(checkpoints.map((checkpoint) => checkpoint.id));

  const first = checkpoints[0];
  const last = checkpoints[checkpoints.length - 1];
  if (first) selected.add(first.id);
  if (last) selected.add(last.id);

  const actions = entries.filter((entry) => entry.type === "action" || entry.type === "domain_event");
  if (!actions.length) return selected;

  const contextWindowMs = options.stateCheckpointContextWindowMs ?? DEFAULT_STATE_CHECKPOINT_CONTEXT_WINDOW_MS;
  actions.forEach((action, index) => {
    const previous = findLast(checkpoints, (checkpoint) => checkpoint.monotonicOffsetMs <= action.monotonicOffsetMs);
    if (previous) selected.add(previous.id);

    const nextAction = actions[index + 1];
    const maxAfterOffset = Math.min(
      action.monotonicOffsetMs + contextWindowMs,
      nextAction?.monotonicOffsetMs ?? Number.POSITIVE_INFINITY
    );
    const next = checkpoints.find((checkpoint) => checkpoint.monotonicOffsetMs >= action.monotonicOffsetMs && checkpoint.monotonicOffsetMs <= maxAfterOffset);
    if (next) selected.add(next.id);
  });

  return selected;
}

function isHighFrequencyStateObservation(entry: TimelineEntry): boolean {
  if (entry.type !== "observation") return false;
  if (entry.observationType === "client.state_snapshot" || entry.observationType === "client.state_update") return true;
  const payload = entry.payload;
  return Boolean(payload && typeof payload === "object" && !Array.isArray(payload) && "state" in payload);
}

function findLast<T>(items: T[], predicate: (item: T) => boolean): T | undefined {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index]!;
    if (predicate(item)) return item;
  }
  return undefined;
}
