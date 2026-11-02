import type { JsonObject } from "../../../core/index.ts";
import type { ClientRecordingMessageEvent } from "../internal/index.ts";
import type { DiscardedClientMessage } from "../internal/index.ts";
import type { RecordingBridgeState } from "../internal/index.ts";
import { compactJsonObject } from "../values/index.ts";

export async function storeClientMessage<TTarget, TEvidence>(state: RecordingBridgeState<TTarget, TEvidence>, event: ClientRecordingMessageEvent): Promise<void> {
    if (event.type === "client.recording_entry") {
      const open = state.activeRecordings.get(state.recordingOwnerKey(event.session));
      const active = open?.recordingId === event.message.payload.recordingId ? open : undefined;
      const entry = state.ingress.entry(event.message.payload.entry);
      const message: DiscardedClientMessage = {
        kind: "recording entry",
        label: entry.type,
        recordingId: event.message.payload.recordingId,
        executable: entry.type === "action"
      };
      if (!active) {
        state.noteDiscardedClientMessage(event.session, message);
        return;
      }
      state.writeOrder.enqueue(state.recordingOwnerKey(event.session), {
        ...(active.projectId !== undefined ? { projectId: active.projectId } : {}),
        recordingId: event.message.payload.recordingId,
        entry,
        sender: { session: event.session, message }
      });
      return;
    }
    if (event.type === "client.recording_event") {
      await state.appendRecordingEvent(event.session, event.message.payload, event.message.id);
      return;
    }
    if (event.type === "client.snapshot") {
      await state.appendSnapshot(event.session, event.message.payload, event.message.id);
      return;
    }
    if (event.type === "client.state_update") {
      await state.appendStateUpdate(event.session, event.message.payload, event.message.id);
      return;
    }
    if (event.type === "client.error") {
      const active = state.activeRecordings.get(state.recordingOwnerKey(event.session));
      if (!active) return;
      await state.writeOrder.flush(state.recordingOwnerKey(event.session));
      await state.appendOrDiscard(active, [{ session: event.session, message: { kind: "error", label: "marker", executable: false } }], () => state.sink.append({
        ...(active.projectId !== undefined ? { projectId: active.projectId } : {}),
        recordingId: active.recordingId,
        entry: {
          type: "marker",
          label: `Client error: ${event.message.payload.message}`,
          ...(event.message.timestamp !== undefined ? { timestamp: event.message.timestamp } : {}),
          sourceId: `client.${event.session.clientId}.events`,
          metadata: compactJsonObject({ ...(event.message.payload.code ? { code: event.message.payload.code } : {}), ...(event.message.payload.metadata ?? {}) })
        }
      }));
    }
  }
