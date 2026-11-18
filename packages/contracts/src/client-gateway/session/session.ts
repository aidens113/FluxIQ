import type { JsonObject } from "../../core.js";
import type { ClientGatewayCapability } from "./capability.ts";
import type { ClientGatewayClientType } from "./client-type.ts";
import type { ClientGatewayStateUpdate } from "./state-update.ts";
import type { ClientGatewaySessionStatus } from "./status.ts";

export type ClientGatewaySession = {
  sessionId: string;
  clientId: string;
  clientType: ClientGatewayClientType;
  name: string;
  version?: string;
  status: ClientGatewaySessionStatus;
  connectedAt: number;
  lastSeenAt: number;
  pairedAt?: number;
  disconnectedAt?: number;
  trustedClientId?: string;
  operatorUserId?: string;
  projectId?: string | null;
  activeRecordingId?: string | null;
  capabilities: ClientGatewayCapability[];
  stateUpdate?: ClientGatewayStateUpdate;
  metadata?: JsonObject;
  /** The managed host this session's trust was enrolled for; absent for a client a person paired. Set by Core from the redeemed ticket, never claimed by the client. */
  managedHostId?: string;
};
