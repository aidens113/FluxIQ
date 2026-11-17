import type { ClientGatewayRevocationReason } from "../../platform/index.ts";

/**
 * `server.revoked` (gateway 0.2): the credential this socket connected with is
 * revoked. The gateway closes the socket after it; the client discards the
 * credential and must connect again through the connect flow.
 */
export type ClientGatewayRevokedNotice = { reason: ClientGatewayRevocationReason; message?: string };
