import type { ClientGatewayPairingChallenge, ClientGatewaySession, ClientGatewayTrustedClientView } from "../session/index.ts";
import type { ClientGatewayAuditEntry } from "./audit-entry.ts";

export type ClientGatewaySnapshotView = {
  enabled: boolean;
  publicUrl?: string;
  sessions: ClientGatewaySession[];
  pairings: ClientGatewayPairingChallenge[];
  trustedClients: ClientGatewayTrustedClientView[];
  auditLog: ClientGatewayAuditEntry[];
};
