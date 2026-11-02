import type { JsonObject } from "../../core/index.ts";
import type { EvidenceReference, CreateRecordingSessionInput, RecordingSession } from "@fluxiq/contracts/recording";
import type { StateSnapshot } from "@fluxiq/contracts/state";
import type { AutomationStateStore, StateUnsubscribe } from "../state/index.ts";
import { appendRecordingStateCheckpoint, appendRecordingStateDelta, createRecordingSession } from "./session.ts";
export type AutomationStudioRecordingControllerOptions<TTarget = unknown, TEvidence = EvidenceReference> = CreateRecordingSessionInput<TTarget, TEvidence> & {
  stateStore?: AutomationStateStore;
  checkpointOnStart?: boolean;
  metadata?: JsonObject;
};

export class AutomationStudioRecordingController<TTarget = unknown, TEvidence = EvidenceReference> {
  private recording: RecordingSession<TTarget, TEvidence>;
  private unsubscribe: StateUnsubscribe | undefined;
  private previousSnapshot: StateSnapshot;

  constructor(options: AutomationStudioRecordingControllerOptions<TTarget, TEvidence>) {
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

  current(): RecordingSession<TTarget, TEvidence> {
    return structuredClone(this.recording);
  }

  appendCheckpoint(state: StateSnapshot, metadata?: JsonObject): RecordingSession<TTarget, TEvidence> {
    this.recording = appendRecordingStateCheckpoint(this.recording, state, metadata ? { metadata } : {});
    this.previousSnapshot = state;
    return this.current();
  }

  stop(endedAt = Date.now()): RecordingSession<TTarget, TEvidence> {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.recording = { ...this.recording, endedAt: Math.max(endedAt, this.recording.startedAt) };
    return this.current();
  }
}
