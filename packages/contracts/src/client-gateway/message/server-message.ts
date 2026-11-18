import type { JsonObject } from "../../core.js";
import type { ClientGatewayActionCommand } from "../action/index.ts";
import type { ClientGatewayActivity } from "../activity/index.ts";
import type { ClientGatewayModelAccessChanged } from "../model-access/index.ts";
import type { ClientGatewayConversationChanged, ClientGatewayProjectAccessEnded, ClientGatewayProjectFocused } from "../project-focus/index.ts";
import type { ClientGatewayEnvelope } from "../protocol/index.ts";
import type { ClientGatewayReconcileRequest } from "../reconcile/index.ts";
import type { ClientGatewayGoingAwayNotice, ClientGatewayPairingRequired, ClientGatewayRevokedNotice, ClientGatewaySessionReady } from "../session/index.ts";

export type ClientGatewayServerMessage =
  | ClientGatewayEnvelope<"server.pairing_required", ClientGatewayPairingRequired>
  | ClientGatewayEnvelope<"server.session_ready", ClientGatewaySessionReady>
  | ClientGatewayEnvelope<"server.start_recording", { recordingId: string; projectId?: string | null; taskId?: string; domainId?: string }>
  | ClientGatewayEnvelope<"server.stop_recording", { recordingId?: string }>
  | ClientGatewayEnvelope<"server.capture_snapshot", { kind?: string; metadata?: JsonObject }>
  | ClientGatewayEnvelope<"server.execute_action", ClientGatewayActionCommand & { commandId: string }>
  | ClientGatewayEnvelope<"server.reconcile_command", ClientGatewayReconcileRequest>
  | ClientGatewayEnvelope<"server.set_active_tab", { tabId: string }>
  | ClientGatewayEnvelope<"server.activity", ClientGatewayActivity>
  | ClientGatewayEnvelope<"server.ping", { nonce: string }>
  | ClientGatewayEnvelope<"server.disconnect", { reason: string }>
  | ClientGatewayEnvelope<"server.revoked", ClientGatewayRevokedNotice>
  | ClientGatewayEnvelope<"server.going_away", ClientGatewayGoingAwayNotice>
  | ClientGatewayEnvelope<"server.project_focused", ClientGatewayProjectFocused>
  | ClientGatewayEnvelope<"server.project_access_ended", ClientGatewayProjectAccessEnded>
  | ClientGatewayEnvelope<"server.conversation_changed", ClientGatewayConversationChanged>
  | ClientGatewayEnvelope<"server.model_access_changed", ClientGatewayModelAccessChanged>
  | ClientGatewayEnvelope<"server.error", { message: string; code?: string; metadata?: JsonObject }>;
