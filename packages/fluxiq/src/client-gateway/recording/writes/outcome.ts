import type { ClientMessageSender } from "../internal/index.ts";
import type { ClientRecordingRef } from "../internal/index.ts";
import type { RecordingBridgeState } from "../internal/index.ts";
import type { ClosedClientRecording } from "../internal/index.ts";
import type { RecordingAppendResult } from "./append-result.ts";

export async function appendOrDiscard<TTarget, TEvidence, T>(state: RecordingBridgeState<TTarget, TEvidence>, recording: ClientRecordingRef, senders: readonly ClientMessageSender[], append: () => Promise<T>): Promise<RecordingAppendResult<T>> {
    const address = { recordingId: recording.recordingId, ...(recording.projectId !== undefined ? { projectId: recording.projectId } : {}), ...(recording.domainId !== undefined ? { domainId: recording.domainId } : {}) };
    const originals = senders.map(sender => {
      const ownerKey = state.recordingOwnerKey(sender.session);
      const active = state.activeRecordings.get(ownerKey);
      const closed = state.closedRecordings.get(ownerKey);
      const known = sameAddress(active, address) ? active : sameAddress(closed, address) ? closed : address;
      return { sender, ownerKey, active, closed, address: { ...address, ...(address.domainId === undefined && known?.domainId !== undefined ? { domainId: known.domainId } : {}) } };
    });
    try {
      return { kind: "appended", value: await append() };
    } catch (error) {
      const stored = await state.readRecordingForFinalization(address);
      if (stored.kind !== "recording" || stored.recording.recordingId !== address.recordingId || stored.recording.endedAt === undefined) throw error;
      for (const original of originals) {
        const currentClosed = state.closedRecordings.get(original.ownerKey);
        const unchanged = currentClosed === original.closed && sameAddress(original.active, address);
        let diagnostic: ClosedClientRecording | undefined;
        if (sameAddress(currentClosed, address) || unchanged) {
          state.rememberClosedRecording(original.ownerKey, original.address);
          const remembered = state.closedRecordings.get(original.ownerKey);
          if (sameAddress(remembered, address)) diagnostic = remembered;
        }
        diagnostic ??= sameAddress(original.closed, address) ? original.closed : undefined;
        diagnostic ??= { ...original.address, finalizedAt: Date.now(), discardedEvents: 0, discardedActions: 0, reported: false };
        if (diagnostic.finalizedAt === undefined) diagnostic.finalizedAt = Date.now();
        state.noteDiscardedClientMessage(original.sender.session, original.sender.message, diagnostic);
      }
      return { kind: "discarded", cause: error };
    }
  }

function sameAddress(left: { recordingId?: string; projectId?: string | null } | undefined, right: ClientRecordingRef): boolean {
  return left !== undefined && left.recordingId === right.recordingId && (left.projectId ?? null) === (right.projectId ?? null);
}
