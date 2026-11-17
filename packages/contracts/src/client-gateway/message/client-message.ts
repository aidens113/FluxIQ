import type { JsonObject } from "../../core.js";
import type { ClientGatewayReportedActionResult } from "../action/index.ts";
import type { ClientGatewayFocusProjectRequest } from "../project-focus/index.ts";
import type { ClientGatewayEnvelope } from "../protocol/index.ts";
import type { ClientGatewayReconcileAnswer } from "../reconcile/index.ts";
import type { ClientGatewayAppendRecordingEntryRequest, ClientGatewayRecordingEvent, ClientGatewaySnapshot, ClientGatewayStartRecordingRequest, ClientGatewayStopRecordingRequest } from "../recording/index.ts";
import type { ClientGatewayCapability, ClientGatewayClientHello, ClientGatewayStateUpdate } from "../session/index.ts";

export type ClientGatewayClientMessage =
  | ClientGatewayEnvelope<"client.hello", ClientGatewayClientHello>
  // Deprecated compatibility path. New clients wait for web-panel approval.
  | ClientGatewayEnvelope<"client.pairing_submit", { pairingCode: string }>
  | ClientGatewayEnvelope<"client.capabilities", { capabilities: ClientGatewayCapability[] }>
  | ClientGatewayEnvelope<"client.state_update", ClientGatewayStateUpdate>
  | ClientGatewayEnvelope<"client.start_recording", ClientGatewayStartRecordingRequest>
  | ClientGatewayEnvelope<"client.stop_recording", ClientGatewayStopRecordingRequest>
  | ClientGatewayEnvelope<"client.recording_entry", ClientGatewayAppendRecordingEntryRequest>
  | ClientGatewayEnvelope<"client.recording_event", ClientGatewayRecordingEvent>
  | ClientGatewayEnvelope<"client.snapshot", ClientGatewaySnapshot>
  | ClientGatewayEnvelope<"client.action_result", ClientGatewayReportedActionResult>
  | ClientGatewayEnvelope<"client.reconcile_result", ClientGatewayReconcileAnswer>
  // The person pressed Forget in this browser: its trust ends. An older Core ignores it, and the browser still drops its credential.
  | ClientGatewayEnvelope<"client.forget_pairing", Record<string, never>>
  // The client stored the credential in its last `server.session_ready`, so the one before it may end now. An older Core ignores it, and the next use of the new one says the same.
  | ClientGatewayEnvelope<"client.credential_received", Record<string, never>>
  // `ClientGatewayFocusProjectRequest`; an older Core ignores it.
  | ClientGatewayEnvelope<"client.focus_project", ClientGatewayFocusProjectRequest>
  | ClientGatewayEnvelope<"client.error", { message: string; code?: string; metadata?: JsonObject }>;
