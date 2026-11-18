import type { ConnectUserSummary, ConnectWorkspaceSummary } from "../../platform/index.ts";

/**
 * `server.session_ready`. Gateway 0.2 adds who the session acts as (`user`,
 * `workspace`) and `credentialExpiresAt` (epoch milliseconds); a connected
 * client's credential rotates on every connect, and `token` is then the new
 * credential the client stores in place of the old one.
 */
export type ClientGatewaySessionReady = {
  sessionId: string;
  token: string;
  projectId?: string | null;
  user?: ConnectUserSummary;
  workspace?: ConnectWorkspaceSummary;
  credentialExpiresAt?: number;
};
