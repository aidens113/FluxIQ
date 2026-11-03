import type { ClientRecordingRef, RecordingBridgeState } from "../../internal/index.ts";
import type { RecordingIngressPolicy } from "../../policies/index.ts";
import { readCaptureRecording } from "./recording.ts";

export async function captureRecordingIngress<TTarget, TEvidence>(state: RecordingBridgeState<TTarget, TEvidence>, captured: ClientRecordingRef): Promise<RecordingIngressPolicy<TTarget, TEvidence>> {
  const scoped = state.scopedIngress;
  const select = state.scopedIngressForRecording;
  if (!scoped || !select) throw new Error("recording.owner_required");
  const recording = await readCaptureRecording(state, captured);
  return select.call(scoped, recording);
}
