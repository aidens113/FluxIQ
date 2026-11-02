import type { ClientGatewaySession, ClientGatewayStopRecordingRequest } from "../../../contracts.ts";
import type { RecordingSession } from "@fluxiq/contracts/recording";
import type { RecordingBridgeState } from "../../internal/index.ts";
import { delay } from "../../values/index.ts";

export async function stopRecordingFromClient<TTarget, TEvidence>(state: RecordingBridgeState<TTarget, TEvidence>, session: ClientGatewaySession, input: ClientGatewayStopRecordingRequest): Promise<RecordingSession<TTarget, TEvidence> | null> {
  const ownerKey = state.recordingOwnerKey(session);
  const open = state.activeRecordings.get(ownerKey);
  const closed = state.closedRecordings.get(ownerKey);
  const owned = open?.recordingId === input.recordingId ? open : closed?.recordingId === input.recordingId && closed.finalizedAt !== undefined ? closed : undefined;
  if (!owned) {
    await state.gateway.sendError(session.sessionId, { code: "recording.owner_required", message: "The client has no owned recording with that identity." });
    return null;
  }
  await delay(state.stopDrainMs);
  await state.writeOrder.settled(ownerKey);
  await state.writeOrder.flush(ownerKey);
  const recording = await state.sink.finalize({ ...(owned.projectId !== undefined ? { projectId: owned.projectId } : {}), recordingId: input.recordingId, ...(input.endedAt !== undefined ? { endedAt: input.endedAt } : {}) });
  if (state.activeRecordings.get(ownerKey)?.recordingId === input.recordingId) state.activeRecordings.delete(ownerKey);
  state.rememberClosedRecording(ownerKey, { recordingId: input.recordingId, ...(owned.projectId !== undefined ? { projectId: owned.projectId } : {}), ...(owned.domainId !== undefined ? { domainId: owned.domainId } : {}) });
  return recording;
}
