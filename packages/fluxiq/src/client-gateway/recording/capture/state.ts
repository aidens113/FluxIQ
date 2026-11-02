import type { JsonObject } from "../../../core/index.ts";
import type { ClientGatewaySession } from "../../contracts.ts";
import type { RecordingBridgeState } from "../internal/index.ts";
import { stringMetadataValue } from "../values/index.ts";

export async function appendStateUpdate<TTarget, TEvidence>(state: RecordingBridgeState<TTarget, TEvidence>, session: ClientGatewaySession, stateUpdate: JsonObject, messageId: string): Promise<void> {
    const active = state.activeRecordings.get(state.recordingOwnerKey(session));
    if (!active) {
      // One that says its client is not recording is page state, not lost evidence.
      if (stateUpdate.recording !== false) state.noteDiscardedClientMessage(session, { kind: "state update", label: "client.state_update", domainId: stringMetadataValue(stateUpdate.metadata, "domainId") ?? null, inputId: stringMetadataValue(stateUpdate.metadata, "inputId") });
      return;
    }
    const domainId = active.domainId ?? stringMetadataValue(stateUpdate.metadata, "domainId");
    const inputId = stringMetadataValue(stateUpdate.metadata, "inputId");
    if (domainId && inputId) {
      await state.writeOrder.flush(state.recordingOwnerKey(session));
      if (await state.recordGatewayInput({
        active,
        domainId,
        inputId,
        payload: stateUpdate.state && typeof stateUpdate.state === "object" && !Array.isArray(stateUpdate.state) ? stateUpdate.state : stateUpdate,
        sourceId: `client.${session.clientId}.observations`,
        messageId,
        ...(stateUpdate.metadata && typeof stateUpdate.metadata === "object" && !Array.isArray(stateUpdate.metadata) ? { metadata: stateUpdate.metadata } : {}),
        sender: { session, message: { kind: "state update", label: "client.state_update", domainId, inputId } }
      })) return;
    }
    state.writeOrder.enqueue(state.recordingOwnerKey(session), {
      ...(active.projectId !== undefined ? { projectId: active.projectId } : {}),
      recordingId: active.recordingId,
      entry: {
        type: "observation",
        observationType: "client.state_update",
        sourceId: `client.${session.clientId}.observations`,
        correlationId: messageId,
        payload: stateUpdate
      },
      sender: { session, message: { kind: "state update", label: "client.state_update", executable: false } }
    });
  }
