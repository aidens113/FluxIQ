import type { RecordingSession } from "@fluxiq/contracts/recording";
import type { RecordingBridgeState } from "../internal/index.ts";
import { delay } from "../values/index.ts";

export async function stopRecording<TTarget, TEvidence>(state: RecordingBridgeState<TTarget, TEvidence>, sessionId: string): Promise<RecordingSession<TTarget, TEvidence> | null> {
    const session = state.session(sessionId);
    const ownerKey = state.recordingOwnerKey(session);
    const active = state.activeRecordings.get(ownerKey);
    const closing = active ? { recordingId: active.recordingId, ...(active.projectId !== undefined ? { projectId: active.projectId } : {}), ...(active.domainId !== undefined ? { domainId: active.domainId } : {}) } : undefined;
    await state.gateway.stopRecording(sessionId, closing?.recordingId);
    if (!active || !closing) return null;
    await delay(state.stopDrainMs);
    await state.writeOrder.settled(ownerKey);
    await state.writeOrder.flush(ownerKey);
    const recording = await state.sink.finalize({ ...(closing.projectId !== undefined ? { projectId: closing.projectId } : {}), recordingId: closing.recordingId });
    // A newer ref stays current even when it reuses the original address.
    const current = state.activeRecordings.get(ownerKey);
    if (current === active && current.recordingId === closing.recordingId && (current.projectId ?? null) === (closing.projectId ?? null) && current.domainId === closing.domainId) {
      state.activeRecordings.delete(ownerKey);
      state.rememberClosedRecording(ownerKey, closing);
    }

    return recording;
  }
