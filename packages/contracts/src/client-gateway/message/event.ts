import type { JsonObject } from "../../core.js";
import type { ClientGatewayActionResult } from "../action/index.ts";
import type { ClientGatewayEnvelope } from "../protocol/index.ts";
import type { ClientGatewayAppendRecordingEntryRequest, ClientGatewayRecordingEvent, ClientGatewaySnapshot, ClientGatewayStartRecordingRequest, ClientGatewayStopRecordingRequest } from "../recording/index.ts";
import type { ClientGatewaySession, ClientGatewayStateUpdate } from "../session/index.ts";

export type ClientGatewayEvent =
  | { type: "session.ready"; session: ClientGatewaySession }
  | { type: "session.disconnected"; session: ClientGatewaySession }
  | { type: "client.state_update"; session: ClientGatewaySession; message: ClientGatewayEnvelope<"client.state_update", ClientGatewayStateUpdate> }
  | { type: "client.start_recording"; session: ClientGatewaySession; message: ClientGatewayEnvelope<"client.start_recording", ClientGatewayStartRecordingRequest> }
  | { type: "client.stop_recording"; session: ClientGatewaySession; message: ClientGatewayEnvelope<"client.stop_recording", ClientGatewayStopRecordingRequest> }
  | { type: "client.recording_entry"; session: ClientGatewaySession; message: ClientGatewayEnvelope<"client.recording_entry", ClientGatewayAppendRecordingEntryRequest> }
  | { type: "client.recording_event"; session: ClientGatewaySession; message: ClientGatewayEnvelope<"client.recording_event", ClientGatewayRecordingEvent> }
  | { type: "client.snapshot"; session: ClientGatewaySession; message: ClientGatewayEnvelope<"client.snapshot", ClientGatewaySnapshot> }
  | { type: "client.action_result"; session: ClientGatewaySession; message: ClientGatewayEnvelope<"client.action_result", ClientGatewayActionResult> }
  | { type: "client.error"; session: ClientGatewaySession; message: ClientGatewayEnvelope<"client.error", { message: string; code?: string; metadata?: JsonObject }> };
