import type { ClientGatewayRecordingEvent } from "../../contracts.ts";
import type { ClientGatewaySession } from "../../contracts.ts";
import type { RecordingBridgeState } from "../internal/index.ts";
import { compactJsonObject } from "../values/index.ts";

export async function reportRejectedRecordingEvent<TTarget, TEvidence>(state: RecordingBridgeState<TTarget, TEvidence>, session: ClientGatewaySession, event: ClientGatewayRecordingEvent, messageId: string, reason: string): Promise<void> {
    await state.gateway.sendError(session.sessionId, {
      message: reason,
      code: "recording.event_rejected",
      metadata: compactJsonObject({
        ...state.startPolicy.diagnosticMetadata,
        clientGatewayMessageId: messageId,
        clientId: session.clientId,
        eventType: event.eventType,
        ...(event.eventId !== undefined ? { eventId: event.eventId } : {}),
        ...(event.domainId !== undefined ? { domainId: event.domainId } : {}),
      })
    });
  }
