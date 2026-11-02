import type { RecordingSession } from "@fluxiq/contracts/recording";
import type { ClientGatewaySession } from "../../../contracts.ts";
import type { ClientGatewayStartRecordingRequest } from "../../../contracts.ts";
import type { PendingClientStart } from "../../internal/index.ts";
import type { RecordingBridgeState } from "../../internal/index.ts";

export async function startRecordingFromClient<TTarget, TEvidence>(state: RecordingBridgeState<TTarget, TEvidence>, session: ClientGatewaySession, input: ClientGatewayStartRecordingRequest): Promise<RecordingSession<TTarget, TEvidence> | null> {
    const ownerKey = state.recordingOwnerKey(session);
    const previous = state.pendingStarts.get(ownerKey);
    let settle = () => {};
    const pending: PendingClientStart = { recordingId: input.recordingId, stopRequested: false, settled: new Promise<void>((resolve) => { settle = resolve; }) };
    state.pendingStarts.set(ownerKey, pending);
    // Taken before the first await: what the client sent before this start never lands in its recording.
    const received = state.writeOrder.settled(ownerKey);
    try {
      await previous?.settled;
      await received;
      return await state.openClientRecording(session, input, pending);
    } finally {
      if (state.activeRecordings.get(ownerKey)?.recordingId !== input.recordingId) state.rememberClosedRecording(ownerKey, { recordingId: input.recordingId, ...(pending.projectId !== undefined ? { projectId: pending.projectId } : {}) }, false);
      if (state.pendingStarts.get(ownerKey) === pending) state.pendingStarts.delete(ownerKey);
      settle();
    }
  }
