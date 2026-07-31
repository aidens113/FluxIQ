import type { NormalizedTimeline, NormalizationOptions, TimelineNormalizer } from "./contracts";
import type { RecordingSession, StateSnapshot, TimelineEntry } from "../model";
import { diffStateSnapshots } from "../model";

export class ConservativeTimelineNormalizer implements TimelineNormalizer {
  normalize(recording: RecordingSession, options: NormalizationOptions = {}): NormalizedTimeline {
    const issues: NormalizedTimeline["issues"] = [];
    const timeline: TimelineEntry[] = [];
    let previousCheckpoint: StateSnapshot = recording.initialState;
    let deltasSinceCheckpoint = 0;
    const checkpointPolicy = options.checkpointPolicy ?? {};

    for (const entry of recording.timeline) {
      if (entry.type === "state_checkpoint") {
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
