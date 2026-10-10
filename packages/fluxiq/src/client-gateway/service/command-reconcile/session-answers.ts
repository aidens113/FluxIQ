import { CLIENT_GATEWAY_RECONCILE_ANSWER_METADATA_KEY, type ClientGatewaySession } from "@fluxiq/contracts/client-gateway";

/**
 * Whether a session said it answers `server.reconcile_command`: any capability
 * it declared carries `metadata.answersReconcile: true`. A client that never
 * declared it is never asked, so a client built before the request existed
 * keeps exactly the outcome it had.
 */
export function clientGatewaySessionAnswersReconcile(session: Pick<ClientGatewaySession, "capabilities">): boolean {
  return session.capabilities.some((capability) => capability.metadata?.[CLIENT_GATEWAY_RECONCILE_ANSWER_METADATA_KEY] === true);
}
