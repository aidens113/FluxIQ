import type { ClientGatewayEvent } from "../../contracts.ts";
import type { ClientRecordingMessageEvent } from "../internal/index.ts";
import type { RecordingBridgeState } from "../internal/index.ts";

export async function handleGatewayEvent<TTarget, TEvidence>(state: RecordingBridgeState<TTarget, TEvidence>, event: ClientGatewayEvent): Promise<void> {
    // Replayed or scripted data from a channel-scoped session never becomes a recording or a recording entry.
    if (state.gateway.isScopedSession(event.session.sessionId)) return;
    if (event.type === "client.start_recording") {
      await state.startRecordingFromClient(event.session, event.message.payload);
      return;
    }
    if (event.type === "session.ready" || event.type === "session.disconnected" || event.type === "client.action_result") return;
    // Read as the message arrives: only a start received before it holds it.
    const started = state.awaitClientStart(event.session, event.type === "client.stop_recording" ? event.message.payload.recordingId : undefined);
    if (event.type === "client.stop_recording") {
      await started;
      await state.stopRecordingFromClient(event.session, event.message.payload);
      return;
    }
    // Queued before the first await, so the client's messages are stored in the order they arrived.
    const message: ClientRecordingMessageEvent = event;
    await state.writeOrder.run(state.recordingOwnerKey(event.session), async () => {
      await started;
      await state.storeClientMessage(message);
    });
  }
