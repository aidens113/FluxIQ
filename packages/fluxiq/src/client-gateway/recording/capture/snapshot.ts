import type { ClientGatewaySession } from "../../contracts.ts";
import type { ClientGatewaySnapshot } from "../../contracts.ts";
import type { RecordingBridgeState } from "../internal/index.ts";
import { compactJsonObject } from "../values/index.ts";

export async function appendSnapshot<TTarget, TEvidence>(state: RecordingBridgeState<TTarget, TEvidence>, session: ClientGatewaySession, snapshot: ClientGatewaySnapshot, messageId: string): Promise<void> {
    const active = state.activeRecordings.get(state.recordingOwnerKey(session));
    if (!active) return state.noteDiscardedClientMessage(session, { kind: "snapshot", label: `client.${snapshot.kind}_snapshot`, executable: false });
    if (snapshot.kind === "state" && snapshot.state) {
      state.writeOrder.enqueue(state.recordingOwnerKey(session), {
        ...(active.projectId !== undefined ? { projectId: active.projectId } : {}),
        recordingId: active.recordingId,
        entry: {
          type: "observation",
          observationType: "client.state_snapshot",
          ...(snapshot.timestamp !== undefined ? { timestamp: snapshot.timestamp } : {}),
          sourceId: `client.${session.clientId}.observations`,
          correlationId: snapshot.snapshotId ?? messageId,
          payload: compactJsonObject({ state: snapshot.state, ...(snapshot.metadata !== undefined ? { metadata: snapshot.metadata } : {}) })
        },
        sender: { session, message: { kind: "snapshot", label: "client.state_snapshot", executable: false } }
      });
      return;
    }
    state.writeOrder.enqueue(state.recordingOwnerKey(session), {
      ...(active.projectId !== undefined ? { projectId: active.projectId } : {}),
      recordingId: active.recordingId,
      entry: {
        type: "observation",
        observationType: `client.${snapshot.kind}_snapshot`,
        ...(snapshot.timestamp !== undefined ? { timestamp: snapshot.timestamp } : {}),
        sourceId: `client.${session.clientId}.observations`,
        correlationId: snapshot.snapshotId ?? messageId,
        payload: compactJsonObject({
          ...(snapshot.payload !== undefined ? { payload: snapshot.payload } : {}),
          ...(snapshot.metadata !== undefined ? { metadata: snapshot.metadata } : {})
        })
      },
      sender: { session, message: { kind: "snapshot", label: `client.${snapshot.kind}_snapshot`, executable: false } }
    });
  }
