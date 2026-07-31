import type { JsonObject } from "../../../core";
import {
  appendRecordingStateCheckpoint,
  appendRecordingStateDelta,
  createRecordingSession,
  type AutomationStateStore,
  type CreateRecordingSessionInput,
  type RecordingSession,
  type StateSnapshot,
  type StateUnsubscribe
} from "../model";

export type AutomationStudioRecordingControllerOptions = CreateRecordingSessionInput & {
  stateStore?: AutomationStateStore;
  checkpointOnStart?: boolean;
  metadata?: JsonObject;
};

export class AutomationStudioRecordingController {
  private recording: RecordingSession;
  private unsubscribe: StateUnsubscribe | undefined;
  private previousSnapshot: StateSnapshot;

  constructor(options: AutomationStudioRecordingControllerOptions) {
    const initialState = options.stateStore?.snapshot() ?? options.initialState;
    this.recording = createRecordingSession({ ...options, initialState });
    this.previousSnapshot = initialState;
    if (options.checkpointOnStart) this.recording = appendRecordingStateCheckpoint(this.recording, initialState, { metadata: { reason: "recording_started" } });
    if (options.stateStore) {
      this.unsubscribe = options.stateStore.subscribe((event) => {
        if (event.deltas.length) {
          this.recording = appendRecordingStateDelta(this.recording, this.previousSnapshot, event.snapshot, {
            ...(event.source ? { sourceId: event.source } : {}),
            ...(event.metadata ? { metadata: event.metadata } : {})
          });
        }
        this.previousSnapshot = event.snapshot;
      });
    }
  }

  current(): RecordingSession {
    return structuredClone(this.recording);
  }

  appendCheckpoint(state: StateSnapshot, metadata?: JsonObject): RecordingSession {
    this.recording = appendRecordingStateCheckpoint(this.recording, state, metadata ? { metadata } : {});
    this.previousSnapshot = state;
    return this.current();
  }

  stop(endedAt = Date.now()): RecordingSession {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.recording = { ...this.recording, endedAt: Math.max(endedAt, this.recording.startedAt) };
    return this.current();
  }
}
