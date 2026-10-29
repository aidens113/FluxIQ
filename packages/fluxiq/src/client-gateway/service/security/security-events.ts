import type { ClientGatewayAuditEntry } from "@fluxiq/contracts/client-gateway";

/**
 * The audit entries that are security events: delivered to every
 * `onSecurityEvent` listener as they are recorded, so the web layer can
 * persist them beyond the in-memory audit ring. Everything the transport
 * reports through `recordTransportEvent` is a security event too, whatever
 * its type.
 */
export const CLIENT_GATEWAY_SECURITY_EVENT_TYPES = [
  // Pairing approved: durable trust was created.
  "session.paired",
  // Pairing refused: the approval found the client not waiting, or the operator dismissed it.
  "pairing.refused",
  "pairing.dismissed",
  // A client tried to approve its own pairing.
  "pairing.client_submit_rejected",
  // A pending pairing taken back because its session ended.
  "pairing.withdrawn",
  // A new pairing challenge refused because a pending-pairing cap was reached.
  "pairing.refused_capacity",
  // Trust revoked by an operator.
  "trust.revoked",
  // A returning client's credential or declared domain was not accepted.
  "session.credential_rejected",
  "session.domain_rejected",
  // A hello under another major protocol version.
  "session.protocol_version_refused",
  // A trusted client reconnected and its older session was closed.
  "session.replaced"
] as const;

/**
 * The types a transport is expected to report through `recordTransportEvent`
 * (hosted-production-plan, "Gateway Transport Over The Internet"). Any other
 * type is accepted and delivered the same way.
 */
export const CLIENT_GATEWAY_TRANSPORT_EVENT_TYPES = [
  "transport.origin_refused",
  "transport.frame_too_large",
  "transport.hello_deadline",
  "transport.rate_limited"
] as const;

/** Hears each security event as it is recorded. A throw or a rejection is audited and never reaches the gateway. */
export type ClientGatewaySecurityEventListener = (event: ClientGatewayAuditEntry) => void | Promise<void>;

const SECURITY_EVENT_TYPES: ReadonlySet<string> = new Set(CLIENT_GATEWAY_SECURITY_EVENT_TYPES);

/** Whether an audit entry of `type` is delivered to security listeners. */
export function isClientGatewaySecurityEventType(type: string): boolean {
  return SECURITY_EVENT_TYPES.has(type);
}
