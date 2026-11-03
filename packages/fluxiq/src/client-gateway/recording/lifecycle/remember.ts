import type { RecordingBridgeState } from "../internal/index.ts";
import { reserveClosedRecordingOwner } from "../values/index.ts";

export function rememberClosedRecording<TTarget, TEvidence>(state: RecordingBridgeState<TTarget, TEvidence>, ownerKey: string, closed: { recordingId: string; projectId?: string | null; domainId?: string | null }, finalized = true): void {
    // A message that lost the race to finalization remembers the recording
    // first; closing it afterwards must keep that message's count.
    const remembered = state.closedRecordings.get(ownerKey);
    if (remembered?.recordingId === closed.recordingId && (remembered.projectId ?? null) === (closed.projectId ?? null)) {
      if (finalized && remembered.finalizedAt === undefined) remembered.finalizedAt = Date.now();
      return;
    }
    state.closedRecordings.delete(ownerKey);
    reserveClosedRecordingOwner(state.closedRecordings, ownerKey);
    state.closedRecordings.set(ownerKey, { ...closed, ...(finalized ? { finalizedAt: Date.now() } : {}), discardedEvents: 0, discardedActions: 0, reported: false });
  }
