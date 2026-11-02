import type { ClientGatewaySession } from "../../../contracts.ts";
import type { RecordingBridgeState } from "../../internal/index.ts";

export async function awaitClientStart<TTarget, TEvidence>(state: RecordingBridgeState<TTarget, TEvidence>, session: ClientGatewaySession, stoppingRecordingId: string | undefined): Promise<void> {
    const pending = state.pendingStarts.get(state.recordingOwnerKey(session));
    if (!pending) return;
    if (stoppingRecordingId === pending.recordingId) pending.stopRequested = true;
    await pending.settled;
  }
