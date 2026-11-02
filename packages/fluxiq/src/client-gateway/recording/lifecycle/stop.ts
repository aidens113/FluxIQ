import type { RecordingSession } from "@fluxiq/contracts/recording";
import type { RecordingBridgeState } from "../internal/index.ts";
import { delay } from "../values/index.ts";

export async function stopRecording<TTarget, TEvidence>(state: RecordingBridgeState<TTarget, TEvidence>, sessionId: string): Promise<RecordingSession<TTarget, TEvidence> | null> {
    const session = state.session(sessionId);
    const ownerKey = state.recordingOwnerKey(session);
    const active = state.activeRecordings.get(ownerKey);
    await state.gateway.stopRecording(sessionId, active?.recordingId);
    if (!active) return null;
    await delay(state.stopDrainMs);
    await state.writeOrder.settled(ownerKey);
    await state.writeOrder.flush(ownerKey);
    const recording = await state.sink.finalize({ ...(active.projectId !== undefined ? { projectId: active.projectId } : {}), recordingId: active.recordingId });
    // Only the recording this Stop stopped: one started while it drained stays open.
    if (state.activeRecordings.get(ownerKey)?.recordingId === active.recordingId) state.activeRecordings.delete(ownerKey);
    state.rememberClosedRecording(ownerKey, {
      recordingId: active.recordingId,
      ...(active.projectId !== undefined ? { projectId: active.projectId } : {}),
      ...(active.domainId !== undefined ? { domainId: active.domainId } : {})
    });

    return recording;
  }
