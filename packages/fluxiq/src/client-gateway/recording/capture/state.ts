import type { JsonObject } from "../../../core/index.ts";
import type { ClientGatewaySession } from "../../contracts.ts";
import type { RecordingBridgeState } from "../internal/index.ts";
import { stringMetadataValue } from "../values/index.ts";
import { matchesCaptureDomain, readCaptureRecording } from "./scoped/index.ts";

export async function appendStateUpdate<TTarget, TEvidence>(state: RecordingBridgeState<TTarget, TEvidence>, session: ClientGatewaySession, stateUpdate: JsonObject, messageId: string): Promise<void> {
    const open = state.activeRecordings.get(state.recordingOwnerKey(session));
    const active = state.scopedIngress && open ? { ...open } : open;
    if (!active) {
      // One that says its client is not recording is page state, not lost evidence.
      if (stateUpdate.recording !== false) state.noteDiscardedClientMessage(session, { kind: "state update", label: "client.state_update", domainId: stringMetadataValue(stateUpdate.metadata, "domainId") ?? null, inputId: stringMetadataValue(stateUpdate.metadata, "inputId") });
      return;
    }
    const metadata = state.scopedIngress && stateUpdate.metadata && typeof stateUpdate.metadata === "object" && !Array.isArray(stateUpdate.metadata) ? stateUpdate.metadata : undefined;
    if (state.scopedIngress && !matchesCaptureDomain(active, stateUpdate.domainId, metadata?.domainId)) {
      state.noteDiscardedClientMessage(session, { kind: "state update", label: "client.state_update", recordingId: active.recordingId, ...(active.domainId !== undefined ? { domainId: active.domainId } : {}), executable: false });
      return;
    }
    const domainId = state.scopedIngress ? active.domainId : active.domainId ?? stringMetadataValue(stateUpdate.metadata, "domainId");
    const inputId = stringMetadataValue(stateUpdate.metadata, "inputId");
    if (state.scopedIngress && (!domainId || !inputId)) await readCaptureRecording(state, active);
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
        sender: { session, message: { kind: "state update", label: "client.state_update", domainId, inputId, ...(state.scopedIngress ? { executable: false } : {}) } }
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
