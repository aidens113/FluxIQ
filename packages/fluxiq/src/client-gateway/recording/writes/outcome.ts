import type { ClientMessageSender } from "../internal/index.ts";
import type { ClientRecordingRef } from "../internal/index.ts";
import type { RecordingBridgeState } from "../internal/index.ts";
import type { RecordingAppendResult } from "./append-result.ts";

export async function appendOrDiscard<TTarget, TEvidence, T>(state: RecordingBridgeState<TTarget, TEvidence>, recording: ClientRecordingRef, senders: readonly ClientMessageSender[], append: () => Promise<T>): Promise<RecordingAppendResult<T>> {
    try {
      return { kind: "appended", value: await append() };
    } catch (error) {
      const stored = await state.readRecordingForFinalization(recording);
      if (stored.kind !== "recording" || stored.recording.endedAt === undefined) throw error;
      for (const { session, message } of senders) {
        const ownerKey = state.recordingOwnerKey(session);
        const active = state.activeRecordings.get(ownerKey);
        state.rememberClosedRecording(ownerKey, active?.recordingId === recording.recordingId ? active : recording);
        state.noteDiscardedClientMessage(session, message);
      }
      return { kind: "discarded", cause: error };
    }
  }
