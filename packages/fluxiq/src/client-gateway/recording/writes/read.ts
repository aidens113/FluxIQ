import type { RecordingReadOutcome } from "../../../runtime/recording/sink/index.ts";
import type { RecordingBridgeState, ClientRecordingRef } from "../internal/index.ts";

export async function readRecordingForFinalization<TTarget, TEvidence>(state: RecordingBridgeState<TTarget, TEvidence>, recording: ClientRecordingRef): Promise<RecordingReadOutcome<TTarget, TEvidence>> {
  try {
    return await state.sink.read({ ...(recording.projectId !== undefined ? { projectId: recording.projectId } : {}), recordingId: recording.recordingId });
  } catch (cause) {
    return { kind: "unavailable", cause };
  }
}
