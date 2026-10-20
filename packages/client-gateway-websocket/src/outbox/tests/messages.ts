import type { ClientGatewayClientMessage } from "@fluxiq/contracts/client-gateway";
import { createClientGatewayMessage } from "../../index.ts";
import type { ClientGatewayOutboxBinding, ClientGatewayOutboxEntry } from "../index.ts";

// Test-only builders for queued messages. Payloads are synthetic: no page data.

let counter = 0;
const nextId = () => `message.${++counter}`;

export function recordingEvent(recordingId: string | undefined, eventId = nextId()): ClientGatewayClientMessage {
  return createClientGatewayMessage("client.recording_event", {
    eventType: "test.step",
    eventId,
    ...(recordingId !== undefined ? { recordingId } : {})
  }, { idFactory: nextId });
}

export function stopRecording(recordingId: string): ClientGatewayClientMessage {
  return createClientGatewayMessage("client.stop_recording", { recordingId }, { idFactory: nextId });
}

export function stateUpdate(): ClientGatewayClientMessage {
  return createClientGatewayMessage("client.state_update", { state: { step: counter } }, { idFactory: nextId });
}

export function actionResult(commandId: string, status: "succeeded" | "interrupted" | "failed" = "succeeded"): ClientGatewayClientMessage {
  return createClientGatewayMessage("client.action_result", { commandId, status }, { idFactory: nextId });
}

export function binding(session: string, projectId: string | null, recordingId: string | null = null): ClientGatewayOutboxBinding {
  return { session, projectId, recordingId };
}

export function entry(message: ClientGatewayClientMessage, bound: ClientGatewayOutboxBinding): ClientGatewayOutboxEntry {
  return { binding: bound, message };
}
