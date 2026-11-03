import type { ClientGatewayRecordingEvent } from "../../contracts.ts";
import type { ClientGatewaySession } from "../../contracts.ts";
import type { RecordingBridgeState } from "../internal/index.ts";
import { compactJsonObject } from "../values/index.ts";
import { stringMetadataValue } from "../values/index.ts";
import { matchesCaptureDomain, readCaptureRecording } from "./scoped/index.ts";

export async function appendRecordingEvent<TTarget, TEvidence>(state: RecordingBridgeState<TTarget, TEvidence>, session: ClientGatewaySession, event: ClientGatewayRecordingEvent, messageId: string): Promise<void> {
    const open = state.activeRecordings.get(state.recordingOwnerKey(session));
    const owned = event.recordingId === undefined || event.recordingId === open?.recordingId ? open : undefined;
    const active = state.scopedIngress && owned ? { ...owned } : owned;
    // The recording this event belongs to is not open here: finalized, which is
    // immutable, or its start was refused. The event cannot be kept; the one thing
    // that must not happen is for it to disappear without anyone being told.
    if (!active) {
      state.noteDiscardedClientMessage(session, {
        kind: "recording event",
        label: event.eventType,
        recordingId: event.recordingId,
        ...(event.domainId !== undefined ? { domainId: event.domainId } : {}),
        inputId: stringMetadataValue(event.metadata, "inputId")
      });
      return;
    }
    await state.writeOrder.flush(state.recordingOwnerKey(session));
    if (state.scopedIngress && !matchesCaptureDomain(active, event.domainId, event.metadata?.domainId)) {
      await state.reportRejectedRecordingEvent(session, event, messageId, "Recording event domainId does not match its stored recording.");
      return;
    }
    const domainId = state.scopedIngress ? active.domainId : event.domainId ?? active.domainId ?? stringMetadataValue(event.metadata, "domainId");
    const inputId = stringMetadataValue(event.metadata, "inputId");
    if (state.scopedIngress && (!domainId || !inputId)) await readCaptureRecording(state, active);
    if (domainId && inputId && await state.recordGatewayInput({
      active,
      domainId,
      inputId,
      payload: event.payload ?? compactJsonObject({ ...(event.target ? { target: event.target } : {}) }),
      ...(event.timestamp !== undefined ? { timestampMs: event.timestamp } : {}),
      sourceId: event.sourceId ?? `client.${session.clientId}.events`,
      messageId,
      metadata: compactJsonObject({ ...(event.metadata ?? {}), eventId: event.eventId }),
      sender: { session, message: { kind: "recording event", label: event.eventType, domainId, inputId } }
    })) return;
    if (domainId) {
      const result = await state.appendOrDiscard(active, [{ session, message: { kind: "recording event", label: event.eventType, domainId, inputId } }], () => state.sink.appendDomain({
        ...(active.projectId !== undefined ? { projectId: active.projectId } : {}),
        recordingId: active.recordingId,
        domainId,
        eventType: event.eventType,
        ...(event.eventId !== undefined ? { eventId: event.eventId } : {}),
        ...(event.timestamp !== undefined ? { timestamp: event.timestamp } : {}),
        sourceId: event.sourceId ?? `client.${session.clientId}.events`,
        ...(event.target !== undefined ? { target: event.target } : {}),
        ...(event.payload !== undefined ? { payload: event.payload } : {}),
        metadata: compactJsonObject({
          clientGatewayMessageId: messageId,
          clientId: session.clientId,
          ...(event.metadata ?? {})
        })
      }));
      if (result.kind === "appended" && !result.value.accepted) {
        await state.reportRejectedRecordingEvent(session, event, messageId, "Recording event was rejected by its registered domain contract.");
      }
      return;
    }
    await state.reportRejectedRecordingEvent(session, event, messageId, "Recording event domainId is required.");
  }
