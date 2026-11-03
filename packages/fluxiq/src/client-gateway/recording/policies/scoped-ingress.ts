import type { RecordingSession } from "@fluxiq/contracts/recording";
import type { RecordingIngressPolicy } from "./ingress.ts";

/** The bridge supplies a session read from its original sink/address. */
export interface RecordingScopedIngress<TTarget, TEvidence> {
  forRecording(recording: RecordingSession<TTarget, TEvidence>): RecordingIngressPolicy<TTarget, TEvidence>;
}
