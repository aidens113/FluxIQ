import type { RecordingSession } from "@fluxiq/contracts/recording";
import type { ClientRecordingRef, RecordingBridgeState } from "../../internal/index.ts";

/** The original addressed sink, not duplicated metadata, owns the project lookup. */
export async function readCaptureRecording<TTarget, TEvidence>(state: RecordingBridgeState<TTarget, TEvidence>, captured: ClientRecordingRef): Promise<RecordingSession<TTarget, TEvidence>> {
  const sink = state.sink;
  const read = state.scopedRecordingRead;
  if (!read) throw new Error("recording.owner_required");
  const projectId = captured.projectId;
  const recordingId = captured.recordingId;
  const domainId = captured.domainId;
  const result = await read.call(sink, { ...(projectId !== undefined ? { projectId } : {}), recordingId });
  if (result.kind === "unavailable") throw result.cause;
  const recording = result.recording;
  if (!recording || recording.recordingId !== recordingId || !recording.metadata || typeof recording.metadata !== "object" || Array.isArray(recording.metadata)
    || (recording.metadata.projectId !== undefined && recording.metadata.projectId !== (projectId ?? null))) throw new Error("recording.owner_required");
  const storedDomain = recording.environment?.domainId;
  if ((storedDomain !== null && (typeof storedDomain !== "string" || !storedDomain.trim() || storedDomain !== storedDomain.trim()))
    || storedDomain !== domainId) throw new Error("recording.domain_scope_refused");
  return recording;
}
